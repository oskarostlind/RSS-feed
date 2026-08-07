/**
 * CSV-tolkning för bolagslistor.
 *
 * Egen implementation och inte ett bibliotek, av samma skäl som `parseXlsx`:
 * behovet är en kolumn med text, och ett beroende till hade varit mer kod att
 * lita på än den här filen.
 */

/**
 * Svensk Excel skriver semikolon, inte komma — decimalkommat gör kommatecken
 * omöjligt som fältavgränsare i svenskt lokalformat. En fil som exporterats
 * från ett CRM kan komma med endera, och att gissa fel gör hela filen till en
 * enda kolumn.
 *
 * Gissningen görs på första raden och räknar bara tecken utanför citattecken:
 * `"Peges i Ljusdal AB; Gävle"` innehåller ett semikolon som inte avgränsar
 * något.
 */
export function detectDelimiter(firstLine: string): string {
  const candidates = [";", ",", "\t"];
  let best = ";";
  let bestCount = 0;

  for (const candidate of candidates) {
    let count = 0;
    let inQuotes = false;

    for (let index = 0; index < firstLine.length; index += 1) {
      const char = firstLine[index];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === candidate && !inQuotes) {
        count += 1;
      }
    }

    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return best;
}

/**
 * Tolkar CSV enligt RFC 4180: fält kan citeras, och ett citattecken inuti ett
 * citerat fält skrivs som två. Radbrytning inuti citat avslutar inte raden —
 * det förekommer i adressfält och skulle annars förskjuta hela filen.
 */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const withoutBom = text.replace(/^﻿/, "");

  if (withoutBom.trim().length === 0) {
    return [];
  }

  const firstLineEnd = withoutBom.search(/\r?\n/);
  const firstLine =
    firstLineEnd === -1 ? withoutBom : withoutBom.slice(0, firstLineEnd);
  const separator = delimiter ?? detectDelimiter(firstLine);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endField = (): void => {
    row.push(field);
    field = "";
  };

  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < withoutBom.length; index += 1) {
    const char = withoutBom[index];

    if (inQuotes) {
      if (char === '"') {
        if (withoutBom[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === separator) {
      endField();
    } else if (char === "\n") {
      endRow();
    } else if (char === "\r") {
      // Hanteras av \n som följer. Ensamt \r (gammal Mac) är inte värt koden.
    } else {
      field += char;
    }
  }

  // Sista raden saknar oftast radbrytning.
  if (field.length > 0 || row.length > 0) {
    endRow();
  }

  // Helt tomma rader är vanliga sist i exporter och betyder ingenting.
  return rows.filter((entry) => entry.some((cell) => cell.trim().length > 0));
}
