import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chunk,
  resolveBudgetMs,
  resolveConcurrency,
  resolveDiscoveryCapacity,
  startDeadline,
} from "./discoveryBudget.ts";

test("parallelliteten har ett tak även när miljövariabeln säger annat", () => {
  // Varje bolag öppnar fyra till fem utgående anslutningar. Utan tak skulle
  // en felskriven variabel öppna tusentals samtidigt och få källorna att
  // strypa i stället för att svara.
  assert.equal(resolveConcurrency("500"), 20);
  assert.equal(resolveConcurrency("3"), 3);
});

test("skräpvärden faller tillbaka på standardvärdet i stället för noll", () => {
  // Noll här hade betytt att inga bolag alls bearbetas — en tyst total
  // avstängning av tjänsten från en felstavad miljövariabel.
  assert.equal(resolveConcurrency("noll"), 5);
  assert.equal(resolveConcurrency("-1"), 5);
  assert.equal(resolveConcurrency(undefined), 5);
  assert.equal(resolveBudgetMs("kanske"), 45_000);
});

test("budgeten tar slut och säger till", () => {
  const deadline = startDeadline(0);

  assert.equal(deadline.hasTimeLeft(), false);
});

test("grupperingen tappar inga bolag", () => {
  const items = Array.from({ length: 13 }, (_, index) => index);
  const groups = chunk(items, 5);

  assert.equal(groups.length, 3);
  assert.deepEqual(groups.flat(), items);
  // Sista gruppen är ofullständig, och det är meningen — den körs ändå.
  assert.equal(groups[2].length, 3);
});

test("gruppering av en tom lista ger inga grupper", () => {
  assert.deepEqual(chunk([], 5), []);
});

test("portföljtaket härleds ur vad körningen hinner med", () => {
  // 45 sekunders budget / 2 sekunder per grupp = 22 grupper om fem bolag.
  // Målbildens avsnitt 1 talar om "över 100 bolag", så standardinställningen
  // ligger precis på gränsen — det är avsiktligt synligt.
  assert.equal(resolveDiscoveryCapacity(undefined), 110);
});

test("ett uttryckligt tak vinner men får inte vara obegränsat", () => {
  assert.equal(resolveDiscoveryCapacity("300"), 300);
  assert.equal(resolveDiscoveryCapacity("999999"), 1000);
});

test("ett skräpvärde låser inte ute alla bolag", () => {
  // Noll eller negativt hade betytt att inga bolag alls får läggas till.
  assert.equal(resolveDiscoveryCapacity("0"), 110);
  assert.equal(resolveDiscoveryCapacity("nej"), 110);
});
