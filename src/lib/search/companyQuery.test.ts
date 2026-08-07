import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildQueryVariants,
  significantNameTokens,
  splitCompanyName,
  stripLegalSuffix,
} from "./companyQuery.ts";

test("bolagsformen tas bort men bara på slutet", () => {
  assert.equal(stripLegalSuffix("Peges i Ljusdal AB"), "Peges i Ljusdal");
  assert.equal(stripLegalSuffix("Ericsson"), "Ericsson");
  // "Abisko" börjar med AB men är inget bolagsformsled.
  assert.equal(stripLegalSuffix("Abisko Turiststation"), "Abisko Turiststation");
});

test("ortsledet skiljs från varumärket", () => {
  assert.deepEqual(splitCompanyName("Peges i Ljusdal AB"), {
    brand: "Peges",
    location: "Ljusdal",
  });
  assert.deepEqual(splitCompanyName("Ericsson"), {
    brand: "Ericsson",
    location: null,
  });
});

test("varje bolag söks på mer än en fråga", () => {
  // En exakt fras missar artiklar som bara skriver "Peges", medan enbart
  // varumärket drar in brus. Båda körs och slås ihop.
  const variants = buildQueryVariants("Peges i Ljusdal AB");

  assert.deepEqual(variants, ['"Peges i Ljusdal"', '"Peges" Ljusdal']);
});

test("ett namn utan ortsled ger en fråga, inte en tom lista", () => {
  assert.deepEqual(buildQueryVariants("Ericsson"), ['"Ericsson"']);
});

test("ett namn som bara är en bolagsform ger inga frågor alls", () => {
  // Skulle annars bli en sökning på tomma strängen, som träffar allt.
  assert.deepEqual(buildQueryVariants("AB"), []);
});

test("generiska ord räknas inte som bevis på att artikeln rör bolaget", () => {
  // "Peges i Ljusdal AB" ska matcha på "peges", inte på "i".
  assert.deepEqual(significantNameTokens("Peges i Ljusdal AB"), [
    "peges",
    "ljusdal",
  ]);
});

test("varumärkesledet ligger alltid först bland tokens", () => {
  // Relevansfiltret litar på det när det avgör confidence — tokens[0] är
  // varumärket. Byter ordningen plats blir gränsdragningen fel.
  assert.equal(significantNameTokens("Peges i Ljusdal AB")[0], "peges");
  assert.equal(significantNameTokens("Nordic Steel Group AB")[0], "nordic");
});
