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

interface SheetRef {
  name: string;
  path: string;
}

/**
 * Alla blad i arbetsboken, i den ordning flikarna står i Excel.
 *
 * Sökvägarna hämtas ur arkivets relationer i stället för att anta
 * `xl/worksheets/sheet1.xml`. Filnamnet stämmer oftast, men inte när blad har
 * raderats eller när filen skrivits av något annat än Excel — och då pekar
 * antagandet på fel blad eller på ingenting alls.
 *
 * Tidigare togs bara det första bladet. Det är rätt gissning nästan alltid och
 * helt fel de gånger det inte är det: en användare vars lista ligger i flik två
 * fick beskedet "Filen innehåller inga rader" om en fil som uppenbart innehöll
 * 200 bolag. Ett besked som är både sant och obegripligt.
 */
function resolveSheets(files: Map<string, Buffer>): SheetRef[] {
  const workbook = files.get("xl/workbook.xml")?.toString("utf8");
  const rels = files
    .get("xl/_rels/workbook.xml.rels")
    ?.toString("utf8");

  if (workbook && rels) {
    const $workbook = cheerio.load(workbook, { xml: true });
    const $rels = cheerio.load(rels, { xml: true });

    const resolved = $workbook("sheet")
      .toArray()
      .map((element, index): SheetRef | null => {
        const relationshipId = $workbook(element).attr("r:id");
        const name = $workbook(element).attr("name") ?? `Blad ${index + 1}`;

        if (!relationshipId) {
          return null;
        }

        const target = $rels(`Relationship[Id="${relationshipId}"]`).attr(
          "Target",
        );

        if (!target) {
          return null;
        }

        const path = `xl/${target.replace(/^\/?(xl\/)?/, "")}`;

        return files.has(path) ? { name, path } : null;
      })
      .filter((sheet): sheet is SheetRef => sheet !== null);

    if (resolved.length > 0) {
      return resolved;
    }
  }

  // Reservvägen: filnamnen direkt ur arkivet. Sorteringen måste vara numerisk —
  // `sheet10.xml` sorteras före `sheet2.xml` som text, och då byter flikarna
  // plats mot vad användaren ser i Excel.
  const fallback = [...files.keys()]
    .filter((name) => name.startsWith("xl/worksheets/") && name.endsWith(".xml"))
    .sort((left, right) =>
      left.localeCompare(right, "sv", { numeric: true }),
    )
    .map((path, index) => ({ name: `Blad ${index + 1}`, path }));

  if (fallback.length === 0) {
    throw new XlsxError("Hittade inget kalkylblad i filen.");
  }

  return fallback;
}

export interface XlsxSheet {
  name: string;
  rows: string[][];
}

function readSheetRows(sheetXml: string, sharedStrings: string[]): string[][] {
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

/** Alla blad med innehåll, i flikordning. */
export function parseXlsxSheets(buffer: Buffer): XlsxSheet[] {
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

  const sheets = resolveSheets(files)
    .map((sheet) => {
      const xml = files.get(sheet.path)?.toString("utf8");

      return {
        name: sheet.name,
        rows: xml ? readSheetRows(xml, sharedStrings) : [],
      };
    })
    // Tomma flikar filtreras bort i stället för att visas i bladväljaren. En
    // ny arbetsbok i Excel kommer med tre flikar varav två alltid är tomma, och
    // att erbjuda dem som val är att erbjuda ett fel.
    .filter((sheet) => sheet.rows.length > 0);

  if (sheets.length === 0) {
    throw new XlsxError("Kalkylbladet är tomt eller oläsbart.");
  }

  return sheets;
}

/** Första bladet med innehåll. Kvar för anropare som inte bryr sig om flikar. */
export function parseXlsx(buffer: Buffer): string[][] {
  return parseXlsxSheets(buffer)[0].rows;
}
