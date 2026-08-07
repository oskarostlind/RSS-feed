import assert from "node:assert/strict";
import { test } from "node:test";
import { buildImportPreview, guessNameColumn } from "./buildImportPreview.ts";

const HEADER = ["Kundnr", "Företagsnamn", "Ort"];

function preview(
  dataRows: string[][],
  existingNames: string[] = [],
  columnIndex = 1,
) {
  return buildImportPreview({
    rows: [HEADER, ...dataRows],
    columnIndex,
    hasHeaderRow: true,
    existingNames,
  });
}

test("bolagsform gör inte samma bolag till två bevakningar", () => {
  // Kravet ur målbilden: "Peges i Ljusdal AB" och "Peges i Ljusdal" ska inte
  // bli två rader. Två bevakningar av samma bolag ger dubbla mejl.
  const result = preview([
    ["1", "Peges i Ljusdal AB", "Ljusdal"],
    ["2", "Peges i Ljusdal", "Ljusdal"],
  ]);

  assert.equal(result.counts.ok, 1);
  assert.equal(result.counts["duplicate-in-file"], 1);
});

test("bolag som redan bevakas flaggas mot portföljen", () => {
  const result = preview([["1", "Ericsson AB", "Stockholm"]], ["Ericsson"]);

  assert.equal(result.rows[0].status, "already-watched");
  assert.equal(result.counts.ok, 0);
});

test("radnumret pekar på raden användaren ser i Excel", () => {
  // Rubriken är rad 1, så första dataraden är rad 2. Ett avstämningsfel här
  // gör felrapporten obrukbar på en fil med 150 rader.
  const result = preview([
    ["1", "Peges i Ljusdal AB", "Ljusdal"],
    ["2", "", ""],
  ]);

  assert.equal(result.rows[0].lineNumber, 2);
  assert.equal(result.rows[1].lineNumber, 3);
});

test("summeringsrader och inklistrade rubriker blir inte bevakningar", () => {
  const result = preview([
    ["1", "Peges i Ljusdal AB", "Ljusdal"],
    ["", "Företagsnamn", ""],
    ["", "Summa", ""],
    ["", "-", ""],
  ]);

  assert.equal(result.counts.ok, 1);
  assert.equal(result.counts.implausible, 3);
});

test("förhandsgranskningen rapporterar per rad med skäl", () => {
  const result = preview([["1", "", ""]]);

  assert.equal(result.rows[0].status, "empty");
  assert.match(result.rows[0].reason, /Tom cell/);
});

test("städning av citat och hårda mellanslag ändrar inte namnet i sak", () => {
  const result = preview([["1", '  "Peges  i Ljusdal AB"  ', ""]]);

  assert.equal(result.rows[0].name, "Peges i Ljusdal AB");
  assert.equal(result.rows[0].status, "ok");
});

test("kolumngissningen hittar namnkolumnen även med tillägg i rubriken", () => {
  assert.equal(guessNameColumn(["Kundnr", "Företagsnamn", "Ort"]), 1);
  assert.equal(guessNameColumn(["Id", "Kundnamn (juridiskt)", "Ort"]), 1);
  assert.equal(guessNameColumn(["Kolumn A", "Kolumn B"]), 0);
});
