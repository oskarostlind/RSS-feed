import {
  cleanImportedName,
  companyMatchKey,
  isPlausibleCompanyName,
  looksLikeHeaderOrTotal,
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

    const decide = (): ImportRowStatus => {
      if (name.length === 0) {
        return "empty";
      }

      if (looksLikeHeaderOrTotal(name) || !isPlausibleCompanyName(name)) {
        return "implausible";
      }

      const key = companyMatchKey(name);

      if (existingKeys.has(key)) {
        return "already-watched";
      }

      if (seenInFile.has(key)) {
        return "duplicate-in-file";
      }

      seenInFile.add(key);
      return "ok";
    };

    const status = decide();

    return { lineNumber, raw, name, status, reason: REASONS[status] };
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
const HEADER_HINTS = [
  "företagsnamn",
  "bolagsnamn",
  "kundnamn",
  "företag",
  "bolag",
  "kund",
  "company",
  "customer",
  "account",
  "namn",
  "name",
];

export function guessNameColumn(headerRow: readonly string[]): number {
  const normalized = headerRow.map((cell) => cell.trim().toLowerCase());

  for (const hint of HEADER_HINTS) {
    const exact = normalized.indexOf(hint);

    if (exact !== -1) {
      return exact;
    }
  }

  // Delträff är sämre än exakt men bättre än att gissa kolumn noll: en export
  // med "Kundnamn (juridiskt)" ska hittas.
  for (const hint of HEADER_HINTS) {
    const partial = normalized.findIndex((cell) => cell.includes(hint));

    if (partial !== -1) {
      return partial;
    }
  }

  return 0;
}
