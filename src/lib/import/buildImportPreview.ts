import { headerHintColumn } from "@/lib/import/sheetShape";
import {
  classifyNonCompanyValue,
  cleanImportedName,
  companyMatchKey,
  type NonCompanyReason,
} from "@/lib/import/normalizeCompanyName";

/**
 * Förhandsgranskning av en import, rad för rad.
 *
 * Målbilden är tydlig om varför den finns: "Att importera 150 fel namn och
 * sedan få bevakningar på alla är svårt att ångra." Därför räknar den här
 * funktionen ut allt som ska visas *innan* något skrivs, och skriver inget
 * själv. Den rör inte databasen alls — anroparen hämtar de befintliga namnen
 * och skickar in dem.
 */

export type ImportRowStatus =
  | "ok"
  | "empty"
  | "implausible"
  | "duplicate-in-file"
  | "already-watched";

export interface ImportRow {
  /** Radnummer i filen, med rubrikraden som rad 1. Det användaren ser i Excel. */
  lineNumber: number;
  /** Cellens innehåll så som det stod i filen. */
  raw: string;
  /** Namnet som skulle sparas — städat, men inte omskrivet. */
  name: string;
  status: ImportRowStatus;
  reason: string;
}

export interface ImportPreview {
  rows: ImportRow[];
  /** Rader som skulle skapa en ny bevakning. */
  importable: ImportRow[];
  counts: Record<ImportRowStatus, number>;
}

const REASONS: Record<ImportRowStatus, string> = {
  ok: "Skapas som ny bevakning.",
  empty: "Tom cell — hoppas över.",
  implausible: "Ser inte ut som ett bolagsnamn — hoppas över.",
  "duplicate-in-file": "Samma bolag förekommer tidigare i filen.",
  "already-watched": "Bevakas redan.",
};

/**
 * Skälet i klartext, och alltid vad som *observerats* — inte vad tjänsten
 * beslutat.
 *
 * "Ser inte ut som ett bolagsnamn" på rad 87 av 150 är obrukbart: användaren
 * kan inte avgöra om raden är skräp eller om kolumnvalet är fel. "Ser ut som
 * ett organisationsnummer" på trettio rader i rad säger direkt vad som hänt,
 * och vad man ska göra åt det.
 */
const NON_COMPANY_REASONS: Record<NonCompanyReason, string> = {
  header: "Ser ut som en rubrik- eller summeringsrad.",
  email: "Ser ut som en e-postadress — kanske är det fel kolumn?",
  url: "Ser ut som en webbadress — kanske är det fel kolumn?",
  phone: "Ser ut som ett telefonnummer — kanske är det fel kolumn?",
  orgnr: "Ser ut som ett organisationsnummer — kanske är det fel kolumn?",
  number: "Innehåller bara siffror — kanske är det fel kolumn?",
  date: "Ser ut som ett datum — kanske är det fel kolumn?",
  "no-tokens": "Ser inte ut som ett bolagsnamn.",
};

/**
 * Rubrikraden hoppas alltid över när `hasHeaderRow` är satt, men *dessutom*
 * kontrolleras varje rad mot kända rubrikord. Filer från CRM har ofta en
 * rubrikrad mitt i, en per exporterad grupp, och den som inte upptäcks blir en
 * bevakning på bolaget "Kundnamn".
 */
export function buildImportPreview(options: {
  rows: string[][];
  columnIndex: number;
  hasHeaderRow: boolean;
  /** Bolagsnamn som redan finns i portföljen. */
  existingNames: readonly string[];
}): ImportPreview {
  const { rows, columnIndex, hasHeaderRow, existingNames } = options;

  const existingKeys = new Set(existingNames.map(companyMatchKey));
  const seenInFile = new Set<string>();

  const dataRows = hasHeaderRow ? rows.slice(1) : rows;
  const lineOffset = hasHeaderRow ? 2 : 1;

  const result: ImportRow[] = dataRows.map((row, index) => {
    const raw = row[columnIndex] ?? "";
    const name = cleanImportedName(raw);
    const lineNumber = index + lineOffset;

    const decide = (): { status: ImportRowStatus; reason: string } => {
      if (name.length === 0) {
        return { status: "empty", reason: REASONS.empty };
      }

      const nonCompany = classifyNonCompanyValue(name);

      if (nonCompany) {
        return {
          status: "implausible",
          reason: NON_COMPANY_REASONS[nonCompany],
        };
      }

      const key = companyMatchKey(name);

      if (existingKeys.has(key)) {
        return { status: "already-watched", reason: REASONS["already-watched"] };
      }

      if (seenInFile.has(key)) {
        return {
          status: "duplicate-in-file",
          reason: REASONS["duplicate-in-file"],
        };
      }

      seenInFile.add(key);
      return { status: "ok", reason: REASONS.ok };
    };

    const { status, reason } = decide();

    return { lineNumber, raw, name, status, reason };
  });

  const counts: Record<ImportRowStatus, number> = {
    ok: 0,
    empty: 0,
    implausible: 0,
    "duplicate-in-file": 0,
    "already-watched": 0,
  };

  for (const row of result) {
    counts[row.status] += 1;
  }

  return {
    rows: result,
    importable: result.filter((row) => row.status === "ok"),
    counts,
  };
}

/**
 * Gissar vilken kolumn som innehåller bolagsnamnet.
 *
 * Bara en gissning — målbilden kräver att användaren kan peka ut kolumnen,
 * eftersom filer från CRM sällan har en kolumn som heter "Företagsnamn". Men
 * en förvald kolumn som oftast stämmer är skillnaden mellan ett formulär och
 * ett arbetsmoment.
 */
export function guessNameColumn(headerRow: readonly string[]): number {
  // Kvar som tunn omslagning: noll är svaret när rubriken inte säger något, och
  // den som frågar efter en kolumn behöver ett tal. Själva listan med rubrikord
  // bor i `sheetShape.ts`, tillsammans med den strängare varianten som avgör om
  // rad 1 alls är en rubrik.
  return headerHintColumn(headerRow) ?? 0;
}
