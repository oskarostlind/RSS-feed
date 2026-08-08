"use server";

import { revalidatePath } from "next/cache";
import { getRequiredUserId } from "@/lib/auth";
import {
  describePortfolioLimit,
  getPortfolioCapacity,
} from "@/lib/companies/portfolioLimit";
import {
  buildImportPreview,
  guessNameColumn,
} from "@/lib/import/buildImportPreview";
import {
  EMPTY_COMMIT_STATE,
  EMPTY_PREVIEW_STATE,
  type CommitState,
  type PreviewState,
} from "@/lib/import/importState";
import { cleanImportedName, companyMatchKey } from "@/lib/import/normalizeCompanyName";
import { parseCsv } from "@/lib/import/parseCsv";
import { parseXlsx, XlsxError } from "@/lib/import/parseXlsx";
import { prisma } from "@/lib/prisma";

/**
 * Massimport av bolag från fil.
 *
 * Uppdelad i två steg med flit: `previewImport` läser och bedömer utan att
 * skriva något, `commitImport` skriver. Målbilden kräver förhandsgranskningen,
 * och skälet är att en felaktig import av 150 rader är svår att ångra — varje
 * rad blir en bevakning som mejlar varje morgon.
 */

const COMPANIES_PATH = "/dashboard/companies";

/** 2 MB. En bolagslista med tiotusen rader ryms; en hel databasdump gör det inte. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Tak per import. Inte en teknisk gräns utan en kostnadsgräns: varje bolag är
 * fyra utgående anrop per morgon, för alltid. Enligt avsnitt 6 i målbilden
 * saknas kostnadskontroll per användare helt, och det här är det första taket
 * som faktiskt finns.
 */
const MAX_IMPORT_ROWS = 500;

// Tillstånden och deras utgångsvärden ligger i `importState.ts`. En
// `"use server"`-fil får bara exportera asynkrona funktioner — se den filen för
// vad det kostade att ha dem här.

function errorState(message: string): PreviewState {
  return { ...EMPTY_PREVIEW_STATE, status: "error", error: message };
}

async function readRowsFromFile(
  file: File,
): Promise<{ rows: string[][] } | { error: string }> {
  if (file.size === 0) {
    return { error: "Filen är tom." };
  }

  if (file.size > MAX_FILE_BYTES) {
    return { error: "Filen är större än 2 MB." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  try {
    if (name.endsWith(".xlsx")) {
      return { rows: parseXlsx(buffer) };
    }

    if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
      return { rows: parseCsv(buffer.toString("utf8")) };
    }

    // `.xls` är ett helt annat, binärt format — inte en zip med XML. Att låtsas
    // stödja det och sedan misslyckas kryptiskt är sämre än att säga nej.
    if (name.endsWith(".xls")) {
      return {
        error:
          "Gamla .xls stöds inte. Spara om filen som .xlsx eller .csv i Excel.",
      };
    }

    return { error: "Filformatet stöds inte. Använd .xlsx eller .csv." };
  } catch (error) {
    if (error instanceof XlsxError) {
      return { error: error.message };
    }

    console.error("Failed to parse import file:", error);
    return { error: "Kunde inte läsa filen." };
  }
}

async function existingCompanyNames(userId: string): Promise<string[]> {
  const companies = await prisma.company.findMany({
    where: { userId },
    select: { name: true },
  });

  return companies.map((company) => company.name);
}

/**
 * Läser filen och räknar ut vad en import skulle göra. Skriver ingenting.
 *
 * Anropas om vid kolumnbyte, och då skickas raderna tillbaka i formuläret i
 * stället för filen. Att kräva en ny uppladdning för att byta kolumn vore ett
 * onödigt hinder i just det ögonblick användaren upptäckt att gissningen var
 * fel.
 */
export async function previewImport(
  _previous: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const userId = await getRequiredUserId();

  const requestedColumn = Number(formData.get("columnIndex"));

  // En avmarkerad kryssruta skickas inte alls, så frånvaro betyder två olika
  // saker: "fältet fanns inte i formuläret" (första uppladdningen, default på)
  // och "användaren kryssade ur den". Markören skiljer fallen åt — utan den
  // går rubrikraden aldrig att slå av.
  const headerFieldWasPresent = formData.get("hasHeaderRowPresent") === "1";
  const hasHeaderRow = headerFieldWasPresent
    ? formData.get("hasHeaderRow") === "true"
    : true;

  const cachedRows = formData.get("rows");

  let rows: string[][];
  let fileName: string | null = null;

  if (typeof cachedRows === "string" && cachedRows.length > 0) {
    try {
      rows = JSON.parse(cachedRows) as string[][];
    } catch {
      return errorState("Kunde inte läsa om filen. Ladda upp den igen.");
    }

    const cachedName = formData.get("fileName");
    fileName = typeof cachedName === "string" ? cachedName : null;
  } else {
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return errorState("Välj en fil att importera.");
    }

    const result = await readRowsFromFile(file);

    if ("error" in result) {
      return errorState(result.error);
    }

    rows = result.rows;
    fileName = file.name;
  }

  if (rows.length === 0) {
    return errorState("Filen innehåller inga rader.");
  }

  const headers = rows[0] ?? [];
  const columnIndex =
    Number.isInteger(requestedColumn) &&
    requestedColumn >= 0 &&
    requestedColumn < headers.length
      ? requestedColumn
      : guessNameColumn(headers);

  const preview = buildImportPreview({
    rows,
    columnIndex,
    hasHeaderRow,
    existingNames: await existingCompanyNames(userId),
  });

  return {
    status: "ready",
    error: null,
    headers,
    columnIndex,
    hasHeaderRow,
    preview,
    rows,
    fileName,
  };
}

/**
 * Skapar bevakningarna.
 *
 * Namnen kommer från klienten och räknas därför om från grunden: dubbletter
 * mot portföljen och inom listan kontrolleras igen här. Förhandsgranskningen
 * är ett hjälpmedel för användaren, inte ett skydd — den som postar direkt mot
 * åtgärden har aldrig sett den.
 */
export async function commitImport(
  _previous: CommitState,
  formData: FormData,
): Promise<CommitState> {
  const userId = await getRequiredUserId();
  const raw = formData.get("names");

  if (typeof raw !== "string" || raw.length === 0) {
    return { ...EMPTY_COMMIT_STATE, status: "error", error: "Inget att importera." };
  }

  let names: string[];

  try {
    const parsed = JSON.parse(raw) as unknown;
    names = Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return {
      ...EMPTY_COMMIT_STATE,
      status: "error",
      error: "Listan kunde inte tolkas.",
    };
  }

  if (names.length === 0) {
    return { ...EMPTY_COMMIT_STATE, status: "error", error: "Inget att importera." };
  }

  if (names.length > MAX_IMPORT_ROWS) {
    return {
      ...EMPTY_COMMIT_STATE,
      status: "error",
      error: `Högst ${MAX_IMPORT_ROWS} bolag per import.`,
    };
  }

  const capacity = await getPortfolioCapacity(userId);

  if (capacity.remaining <= 0) {
    return {
      ...EMPTY_COMMIT_STATE,
      status: "error",
      error: describePortfolioLimit(capacity),
    };
  }

  const existingKeys = new Set(
    (await existingCompanyNames(userId)).map(companyMatchKey),
  );
  const seen = new Set<string>();
  const toCreate: string[] = [];

  for (const candidate of names) {
    const name = cleanImportedName(candidate);
    const key = companyMatchKey(name);

    if (name.length === 0 || key.length === 0) {
      continue;
    }

    if (existingKeys.has(key) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    toCreate.push(name);
  }

  if (toCreate.length === 0) {
    return {
      status: "done",
      created: 0,
      skipped: names.length,
      error: null,
    };
  }

  // Delimport i stället för avslag när filen är större än vad som ryms.
  // Att avvisa hela uppladdningen för att de sista tjugo raderna inte får plats
  // vore att straffa användaren för en gräns hen inte känner till — och de
  // rader som föll bort syns i `skipped`.
  const accepted = toCreate.slice(0, capacity.remaining);

  try {
    // `skipDuplicates` mot `@@unique([userId, name])` fångar det som
    // normaliseringen inte gör: exakt samma namn tillagt i en annan flik
    // mellan förhandsgranskningen och sparandet.
    const result = await prisma.company.createMany({
      data: accepted.map((name) => ({ name, userId })),
      skipDuplicates: true,
    });

    revalidatePath(COMPANIES_PATH);
    revalidatePath("/dashboard");

    const droppedForLimit = toCreate.length - accepted.length;

    return {
      status: "done",
      created: result.count,
      skipped: names.length - result.count,
      // Inte `status: "error"` — importen lyckades, men användaren måste få
      // veta att en del av filen inte kom med. Utan beskedet ser det ut som
      // att raderna försvann.
      error:
        droppedForLimit > 0
          ? `${droppedForLimit} bolag fick inte plats. ${describePortfolioLimit(capacity)}`
          : null,
    };
  } catch (error) {
    console.error("Failed to import companies:", error);

    return {
      ...EMPTY_COMMIT_STATE,
      status: "error",
      error: "Importen misslyckades. Försök igen.",
    };
  }
}
