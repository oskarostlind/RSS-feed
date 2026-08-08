"use server";

import { revalidatePath } from "next/cache";
import { getRequiredUserId } from "@/lib/auth";
import {
  describePortfolioLimit,
  getPortfolioCapacity,
} from "@/lib/companies/portfolioLimit";
import { buildImportPreview } from "@/lib/import/buildImportPreview";
import {
  EMPTY_COMMIT_STATE,
  EMPTY_PREVIEW_STATE,
  type CommitState,
  type PreviewState,
} from "@/lib/import/importState";
import { cleanImportedName, companyMatchKey } from "@/lib/import/normalizeCompanyName";
import { parseCsv } from "@/lib/import/parseCsv";
import { parseXlsxSheets, XlsxError, type XlsxSheet } from "@/lib/import/parseXlsx";
import {
  buildColumnChoices,
  detectHeaderRow,
  detectNameColumn,
  pickBestSheet,
} from "@/lib/import/sheetShape";
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

/**
 * Tak för hur många rader granskningen visar.
 *
 * Inte en gräns för hur stor fil som får läsas, utan för hur stort svar som
 * skickas tillbaka till webbläsaren: varje rad reser med namn, status och skäl.
 * En fil på tiotusen rader hade gjort svaret flera megabyte, och en tabell
 * ingen ändå scrollar igenom. Att raderna föll bort **sägs rakt ut** i
 * granskningen — en tyst avkortning ser ut som att filen var mindre än den var,
 * och det är precis den sortens fel den här sidan finns för att förhindra.
 */
const MAX_PREVIEW_ROWS = 1_000;

// Tillstånden och deras utgångsvärden ligger i `importState.ts`. En
// `"use server"`-fil får bara exportera asynkrona funktioner — se den filen för
// vad det kostade att ha dem här.

function errorState(message: string): PreviewState {
  return { ...EMPTY_PREVIEW_STATE, status: "error", error: message };
}

async function readSheetsFromFile(
  file: File,
): Promise<{ sheets: XlsxSheet[] } | { error: string }> {
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
      return { sheets: parseXlsxSheets(buffer) };
    }

    if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
      // En textfil har inga flikar, men resten av flödet vill ha samma form.
      const rows = parseCsv(buffer.toString("utf8"));

      return { sheets: [{ name: file.name, rows }] };
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

/**
 * Läser ett heltalsfält som användaren kan ha ändrat, eller `null` när fältet
 * inte fanns i formuläret alls.
 *
 * Skillnaden är inte formell. Fältet saknas vid första uppladdningen, och då
 * ska tjänsten gissa. Fältet finns men är oförändrat betyder att användaren
 * sett gissningen och låtit den stå — också ett val, och det ska respekteras.
 */
function readChoice(formData: FormData, field: string): number | null {
  const raw = formData.get(field);

  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }

  const parsed = Number(raw);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
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
 * Anropas om varje gång användaren byter blad, kolumn eller rubrikinställning,
 * och läser då om filen från början.
 *
 * **Varför filen läses om i stället för att raderna skickas fram och tillbaka.**
 * Tidigare cachades hela rutnätet som JSON i ett dolt fält, för att slippa
 * ladda upp igen vid ett kolumnbyte. Det var gratis för en liten fil och en
 * tickande bomb för en stor: en fil nära taket på 2 MB blir långt mer än så som
 * JSON, och serveråtgärder har en storleksgräns på begäran. Kolumnbytet hade
 * alltså slutat fungera exakt för de filer där kolumnvalet är svårast.
 *
 * Klienten skickar med samma fil varje gång, så omläsningen kostar användaren
 * ingenting — inget nytt filval, ingen förlorad plats.
 */
export async function previewImport(
  _previous: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const userId = await getRequiredUserId();

  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return errorState("Välj en fil att importera.");
  }

  const parsed = await readSheetsFromFile(file);

  if ("error" in parsed) {
    return errorState(parsed.error);
  }

  const { sheets } = parsed;

  // Bladet först: kolumnen och rubrikraden hör till ett visst blad, och att
  // avgöra dem innan man vet vilket blad det gäller är att avgöra dem om fel
  // sak.
  const requestedSheet = readChoice(formData, "sheetIndex");
  const sheetIndex =
    requestedSheet !== null && requestedSheet < sheets.length
      ? requestedSheet
      : pickBestSheet(sheets);

  // Byter användaren blad är kolumnvalet från förra bladet inte längre ett val
  // utan ett arv. Bättre att gissa om från det nya bladets innehåll än att
  // troget tillämpa ett tal som betydde något annat.
  const sheetChanged = readChoice(formData, "renderedSheetIndex") !== sheetIndex;

  const allRows = sheets[sheetIndex].rows;
  const rows = allRows.slice(0, MAX_PREVIEW_ROWS);
  const droppedRows = allRows.length - rows.length;

  if (rows.length === 0) {
    return errorState("Filen innehåller inga rader.");
  }

  // En avmarkerad kryssruta skickas inte alls, så frånvaro betyder två olika
  // saker: "fältet fanns inte i formuläret" (första uppladdningen) och
  // "användaren kryssade ur den". Markören skiljer fallen åt — utan den går
  // rubrikraden aldrig att slå av.
  const headerFieldWasPresent =
    !sheetChanged && formData.get("hasHeaderRowPresent") === "1";
  const hasHeaderRow = headerFieldWasPresent
    ? formData.get("hasHeaderRow") === "true"
    : detectHeaderRow(rows);

  const columns = buildColumnChoices(rows, hasHeaderRow);
  const requestedColumn = sheetChanged ? null : readChoice(formData, "columnIndex");

  // Kontrollen går mot kolumnernas `index`, inte mot listans längd: tomma
  // kolumner är bortfiltrerade ur menyn, så plats tre i listan kan vara kolumn
  // sju i filen. En längdjämförelse hade tyst kastat användarens val.
  const columnIndex =
    requestedColumn !== null &&
    columns.some((column) => column.index === requestedColumn)
      ? requestedColumn
      : detectNameColumn(rows, hasHeaderRow);

  const preview = buildImportPreview({
    rows,
    columnIndex,
    hasHeaderRow,
    existingNames: await existingCompanyNames(userId),
  });

  return {
    status: "ready",
    error: null,
    columns,
    columnIndex,
    hasHeaderRow,
    autoDetected: !headerFieldWasPresent || requestedColumn === null,
    sheets: sheets.map((sheet, index) => ({
      index,
      name: sheet.name,
      rowCount: sheet.rows.length,
    })),
    sheetIndex,
    preview,
    fileName: file.name,
    droppedRows,
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
