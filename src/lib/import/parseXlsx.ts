import * as cheerio from "cheerio";
import { columnIndexFromRef } from "@/lib/import/cellRef";
import { unzip, ZipError } from "@/lib/import/unzip";

/**
 * Läser en `.xlsx` till ett rutnät av strängar.
 *
 * Avsiktligt en delmängd av formatet. Vi ska hämta bolagsnamn ur en kolumn —
 * inte formler, format, diagram eller pivottabeller. Allt som inte är text
 * konverteras till text, eftersom det är så det ska tolkas ändå: ett
 * organisationsnummer som Excel råkat spara som tal är fortfarande ett
 * organisationsnummer.
 */

export class XlsxError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "XlsxError";
    this.cause = options?.cause;
  }
}

/**
 * Excel lagrar text i en delad strängtabell och skriver bara index i cellerna.
 * Utan tabellen blir varje textcell en siffra.
 *
 * En post kan vara uppdelad i flera `<t>` när delar av texten har olika
 * formatering — "Peges" i fetstil följt av " i Ljusdal" ger två element som
 * ska slås ihop, inte två strängar.
 */
function readSharedStrings(xml: string | undefined): string[] {
  if (!xml) {
    return [];
  }

  const $ = cheerio.load(xml, { xml: true });

  return $("si")
    .toArray()
    .map((element) =>
      $(element)
        .find("t")
        .toArray()
        .map((node) => $(node).text())
        .join(""),
    );
}

/**
 * Hittar det första kalkylbladet via arkivets relationer i stället för att
 * anta `xl/worksheets/sheet1.xml`.
 *
 * Filnamnet stämmer oftast, men inte när blad har raderats eller när filen
 * skrivits av något annat än Excel — och då pekar antagandet på fel blad eller
 * på ingenting alls.
 */
function resolveFirstSheetPath(files: Map<string, Buffer>): string {
  const workbook = files.get("xl/workbook.xml")?.toString("utf8");
  const rels = files
    .get("xl/_rels/workbook.xml.rels")
    ?.toString("utf8");

  if (workbook && rels) {
    const $workbook = cheerio.load(workbook, { xml: true });
    const relationshipId = $workbook("sheet").first().attr("r:id");

    if (relationshipId) {
      const $rels = cheerio.load(rels, { xml: true });
      const target = $rels(`Relationship[Id="${relationshipId}"]`).attr(
        "Target",
      );

      if (target) {
        const normalized = target.replace(/^\/?(xl\/)?/, "");
        const candidate = `xl/${normalized}`;

        if (files.has(candidate)) {
          return candidate;
        }
      }
    }
  }

  const fallback = [...files.keys()]
    .filter((name) => name.startsWith("xl/worksheets/") && name.endsWith(".xml"))
    .sort()[0];

  if (!fallback) {
    throw new XlsxError("Hittade inget kalkylblad i filen.");
  }

  return fallback;
}

export function parseXlsx(buffer: Buffer): string[][] {
  let files: Map<string, Buffer>;

  try {
    files = unzip(buffer);
  } catch (error) {
    if (error instanceof ZipError) {
      throw new XlsxError(error.message, { cause: error });
    }

    throw new XlsxError("Kunde inte läsa Excel-filen.", { cause: error });
  }

  const sharedStrings = readSharedStrings(
    files.get("xl/sharedStrings.xml")?.toString("utf8"),
  );

  const sheetXml = files.get(resolveFirstSheetPath(files))?.toString("utf8");

  if (!sheetXml) {
    throw new XlsxError("Kalkylbladet är tomt eller oläsbart.");
  }

  const $ = cheerio.load(sheetXml, { xml: true });
  const rows: string[][] = [];

  $("row").each((_, rowElement) => {
    const cells: string[] = [];

    $(rowElement)
      .find("c")
      .each((_cellIndex, cellElement) => {
        const cell = $(cellElement);
        const reference = cell.attr("r");
        const type = cell.attr("t");

        let value: string;

        if (type === "s") {
          // Delad sträng: cellvärdet är ett index, inte texten.
          const index = Number(cell.find("v").first().text());
          value = sharedStrings[index] ?? "";
        } else if (type === "inlineStr") {
          value = cell.find("is t").text();
        } else {
          value = cell.find("v").first().text();
        }

        // Tomma celler skrivs inte alls i xml:en, så positionen måste
        // återställas ur referensen. Utan det förskjuts allt till vänster så
        // fort en cell i mitten är tom.
        const column = reference
          ? columnIndexFromRef(reference)
          : cells.length;

        while (cells.length < column) {
          cells.push("");
        }

        cells[column] = value;
      });

    rows.push(cells);
  });

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}
