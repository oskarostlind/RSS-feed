import assert from "node:assert/strict";
import { test } from "node:test";
import { detectDelimiter, parseCsv } from "./parseCsv.ts";

test("semikolon vinner över komma i svenska exporter", () => {
  assert.equal(detectDelimiter("Bolag;Ort;Omsättning"), ";");
});

test("avgränsare inuti citat räknas inte", () => {
  // Utan citatkontrollen skulle kommatecknen i adressen vinna och hela filen
  // bli en enda kolumn.
  assert.equal(
    detectDelimiter('"Peges, i, Ljusdal";Gävleborg'),
    ";",
  );
});

test("citerade fält behåller avgränsare och dubbla citattecken", () => {
  const rows = parseCsv('Namn;Not\n"Peges; i Ljusdal";"säger ""hej"""');

  assert.deepEqual(rows[1], ["Peges; i Ljusdal", 'säger "hej"']);
});

test("radbrytning inuti citat avslutar inte raden", () => {
  // Förekommer i adressfält. Utan detta förskjuts resten av filen.
  const rows = parseCsv('Namn;Adress\nPeges;"Industrivägen 1\n827 32 Ljusdal"');

  assert.equal(rows.length, 2);
  assert.equal(rows[1][1], "Industrivägen 1\n827 32 Ljusdal");
});

test("tomma rader och BOM påverkar inte resultatet", () => {
  const rows = parseCsv("﻿Namn\nPeges\n\n\nEricsson\n");

  assert.deepEqual(rows, [["Namn"], ["Peges"], ["Ericsson"]]);
});

test("tom fil ger inga rader i stället för att kasta", () => {
  assert.deepEqual(parseCsv("   \n\n"), []);
});
