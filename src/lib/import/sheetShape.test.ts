import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildColumnChoices,
  detectHeaderRow,
  detectNameColumn,
  pickBestSheet,
} from "./sheetShape.ts";

test("en fil som börjar direkt med ett bolag har ingen rubrikrad", () => {
  // Det verkliga fallet: en kundlista utan rubriker. Med det gamla antagandet
  // "första raden är alltid rubrik" försvann Evva Scandinavia tyst ur listan.
  const rows = [
    ["Evva Scandinavia AB"],
    ["Mittel Fjärrvärme"],
    ["Schlötter Svenska AB"],
  ];

  assert.equal(detectHeaderRow(rows), false);
});

test("kända rubrikord känns igen", () => {
  assert.equal(detectHeaderRow([["Kundnr", "Företagsnamn", "Ort"], ["1", "Volvo AB", "Göteborg"]]), true);
  assert.equal(detectHeaderRow([["Id", "Bolag (juridiskt)", "Ort"], ["1", "Volvo AB", "Göteborg"]]), true);
});

test("ett bolag som börjar på ett rubrikord är inte en rubrik", () => {
  // "Kundhuset" innehåller "kund". Med en delsträngsjämförelse hade raden
  // klassats som rubrik och bolaget tappats utan att visas någonstans.
  const rows = [["Kundhuset AB", "Malmö"], ["Volvo AB", "Göteborg"]];

  assert.equal(detectHeaderRow(rows), false);
});

test("rubriker vi inte har ord för fångas av att de inte ser ut som bolag", () => {
  const rows = [
    ["Motpart 2026", "Region"],
    ["Volvo AB", "Väst"],
    ["Peges i Ljusdal AB", "Nord"],
    ["Schlötter Svenska AB", "Syd"],
  ];

  // "Motpart 2026" är inget bolagsnamn vi kan bekräfta, medan raderna under är
  // det. Då är rad 1 en rubrik.
  assert.equal(detectHeaderRow(rows), true);
});

test("namnkolumnen hittas på innehållet när rubrik saknas", () => {
  const rows = [
    ["1001", "556036-0793", "Volvo AB", "info@volvo.se"],
    ["1002", "556016-0680", "Peges i Ljusdal AB", "hej@peges.se"],
    ["1003", "556037-7326", "Schlötter Svenska AB", "kontakt@schlotter.se"],
  ];

  assert.equal(detectNameColumn(rows, false), 2);
});

test("rubriken vinner över heuristiken när båda är rimliga", () => {
  const rows = [
    ["Ort", "Företagsnamn"],
    ["Ljusdal", "Peges i Ljusdal AB"],
    ["Göteborg", "Volvo AB"],
  ];

  assert.equal(detectNameColumn(rows, true), 1);
});

test("bladet med flest bolag vinner över bladet med flest rader", () => {
  const sheets = [
    {
      rows: [
        ["Läs detta först"],
        ["Fyll i fliken Kunder"],
        ["Kontakta support vid frågor"],
        ["Version 3"],
      ],
    },
    { rows: [["Kunder"], ["Volvo AB"], ["Peges i Ljusdal AB"]] },
  ];

  assert.equal(pickBestSheet(sheets), 1);
});

test("kolumnvalet får ett exempelvärde när rubrik saknas", () => {
  const choices = buildColumnChoices(
    [
      ["1001", "Volvo AB"],
      ["1002", "Peges i Ljusdal AB"],
    ],
    false,
  );

  assert.equal(choices[1].label, "Kolumn 2");
  assert.equal(choices[1].sample, "Volvo AB");
});
