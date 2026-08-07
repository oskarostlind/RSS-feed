import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { columnIndexFromRef } from "./cellRef.ts";
import { unzip, ZipError } from "./unzip.ts";

/**
 * Fixturen är skriven av openpyxl, inte av den här koden. Det är hela poängen:
 * ett zip-arkiv man skrivit själv går att läsa fel på ett sätt som är osynligt
 * så länge man bara läser sina egna filer.
 */
const FIXTURE = readFileSync(
  fileURLToPath(new URL("./__fixtures__/bolagslista.xlsx", import.meta.url)),
);

test("packar upp ett riktigt xlsx-arkiv", () => {
  const files = unzip(FIXTURE);

  assert.ok(files.has("xl/worksheets/sheet1.xml"));
  assert.ok(files.has("xl/workbook.xml"));
});

test("uppackat innehåll är läsbar xml, inte förskjutna byte", () => {
  // Det klassiska felet är att återanvända den centrala katalogens
  // fältlängder i den lokala headern. Data börjar då några byte fel och ser
  // ut som skräp — men bara ibland, vilket är värre.
  const sheet = unzip(FIXTURE).get("xl/worksheets/sheet1.xml")?.toString("utf8");

  assert.ok(sheet?.startsWith("<worksheet"));
  assert.match(sheet ?? "", /Peges i Ljusdal AB/);
});

test("kataloger tas inte med som filer", () => {
  for (const name of unzip(FIXTURE).keys()) {
    assert.ok(!name.endsWith("/"), `${name} är en katalog`);
  }
});

test("en fil som inte är ett zip-arkiv ger ett begripligt fel", () => {
  assert.throws(
    () => unzip(Buffer.from("det här är en textfil, inte en xlsx")),
    ZipError,
  );
});

test("kolumnbokstäver räknas i bas 26 utan nolla", () => {
  assert.equal(columnIndexFromRef("A1"), 0);
  assert.equal(columnIndexFromRef("C3"), 2);
  assert.equal(columnIndexFromRef("Z1"), 25);
  // Z följs av AA, inte av BA. Ett av-med-ett här skiftar hela kalkylbladet.
  assert.equal(columnIndexFromRef("AA1"), 26);
  assert.equal(columnIndexFromRef("BC12"), 54);
});
