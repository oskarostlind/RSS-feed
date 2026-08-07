import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessSourceHealth,
  type SourceLabel,
  type SourceTally,
} from "./sourceHealth.ts";

/**
 * Larmlogiken är den enda delen av tjänsten som *inte* går att verifiera genom
 * att köra den skarpt: den ska larma när en källa tystnar, och en källa tystnar
 * inte på beställning. Därför tabelltest.
 *
 * Körs med `npm test` (Nodes inbyggda testkörare). Filen importerar inget från
 * `@/`-aliaset, vilket är avsiktligt — det är det som gör att den kan köras
 * utan byggsteg.
 */

function tally(
  source: SourceLabel,
  companiesQueried: number,
  companiesWithHits: number,
  totalHits: number,
  failures = 0,
): SourceTally {
  return {
    source,
    companiesQueried,
    companiesWithHits,
    totalHits,
    failures,
  };
}

test("en källa som ger noll medan en annan levererar räknas som tyst", () => {
  const report = assessSourceHealth([
    tally("google-rss", 10, 0, 0),
    tally("bing-rss", 10, 8, 40),
  ]);

  assert.deepEqual(report.silent, ["google-rss"]);
  assert.equal(report.healthy, false);
});

test("noll från samtliga källor är en lugn dag, inte ett larm", () => {
  // Det viktigaste negativa fallet. Larmar vi här går larmet varje helg och
  // slutar betyda något.
  const report = assessSourceHealth([
    tally("google-rss", 10, 0, 0),
    tally("bing-rss", 10, 0, 0),
  ]);

  assert.equal(report.healthy, true);
  assert.deepEqual(report.silent, []);
});

test("en källa som kastar fel rapporteras som trasig, inte tyst", () => {
  const report = assessSourceHealth([
    tally("google-rss", 10, 9, 90),
    tally("bing-rss", 10, 0, 0, 10),
  ]);

  assert.deepEqual(report.failing, ["bing-rss"]);
  assert.deepEqual(report.silent, []);
});

test("gnews och jobtech larmar inte på noll", () => {
  // GNews ger noll på svensk lokalpress som normaltillstånd, och ett bolag som
  // inte rekryterar ger noll jobbannonser helt korrekt.
  const report = assessSourceHealth([
    tally("google-rss", 10, 9, 90),
    tally("gnews", 10, 0, 0),
    tally("jobtech", 10, 0, 0),
  ]);

  assert.equal(report.healthy, true);
});

test("enstaka fel sänker inte en källa som annars levererar", () => {
  const report = assessSourceHealth([tally("google-rss", 10, 8, 80, 2)]);

  assert.equal(report.healthy, true);
  assert.equal(report.sources[0].verdict, "healthy");
});
