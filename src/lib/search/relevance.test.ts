import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterAndRankHits,
  isBlockedDomain,
  isCompanyOwnDomain,
  scoreHit,
} from "./relevance.ts";
import type { SearchHit } from "./types.ts";

/**
 * Relevansfiltret avgör vad som mejlas och vad som tystas. Avvägningen står i
 * målbildens avsnitt 4 — täckning framför precision, eftersom en missad konkurs
 * hos en kund kostar mer än ett mejl med en irrelevant rad. Testerna här
 * kodifierar den avvägningen, så att den inte glider bort i en refaktorering.
 */

const COMPANY = "Peges i Ljusdal AB";

function hit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    title: "Peges i Ljusdal förvärvar verkstad",
    url: "https://www.di.se/artikel",
    snippet: "Peges i Ljusdal AB har förvärvat verksamheten.",
    publishedAt: new Date("2026-04-01"),
    ...overrides,
  };
}

test("bolagsregister och katalogtjänster släpps aldrig igenom", () => {
  // De rankar högt på bolagsnamn men innehåller aldrig nyheter — bara samma
  // statiska bolagsdata om och om igen.
  assert.equal(isBlockedDomain("https://www.allabolag.se/peges"), true);
  assert.equal(isBlockedDomain("https://ratsit.se/peges"), true);
  assert.equal(isBlockedDomain("https://www.di.se/artikel"), false);
});

test("underdomäner till blockerade sajter blockeras också", () => {
  assert.equal(isBlockedDomain("https://data.allabolag.se/x"), true);
});

test("en sajt vars namn slutar likadant blockeras inte av misstag", () => {
  // "notallabolag.se" innehåller "allabolag.se" som delsträng.
  assert.equal(isBlockedDomain("https://notallabolag.se/x"), false);
});

test("bolagets egen sajt är inte en oberoende nyhetskälla", () => {
  assert.equal(isCompanyOwnDomain("https://peges.se/nyheter", COMPANY), true);
  assert.equal(
    isCompanyOwnDomain("https://svenskverkstad.se/peges", COMPANY),
    false,
  );
});

test("ortsledet gör inte varje lokal sajt till bolagets egen", () => {
  // "ljusdal" är ett token i namnet, men ljusdal.se är kommunen.
  assert.equal(isCompanyOwnDomain("https://ljusdal.se/nyheter", COMPANY), true);
});

test("artikel som namnger bolaget i rubriken går till mejlet", () => {
  const result = scoreHit(hit(), COMPANY);

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.scored.confidence, "high");
});

test("lokalpressens omskrivningar slängs inte, de sänks", () => {
  // Det viktigaste fallet i hela filen. Lokaltidningar skriver
  // "Ljusdalsföretag" i stället för bolagsnamnet. Ett strikt namnkrav slängde
  // i test bort fyra korrekta artiklar om Peges.
  const result = scoreHit(
    hit({
      title: "Klart: Ljusdalsföretag tar över i Östersund",
      snippet: "Klart: Ljusdalsföretag tar över i Östersund",
    }),
    COMPANY,
  );

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.scored.confidence, "low");
});

test("händelseord höjer poängen", () => {
  const withEvent = scoreHit(hit(), COMPANY);
  const withoutEvent = scoreHit(
    hit({
      title: "Peges i Ljusdal fyller år",
      snippet: "Peges i Ljusdal AB firar jubileum.",
    }),
    COMPANY,
  );

  assert.ok(
    withEvent.ok &&
      withoutEvent.ok &&
      withEvent.scored.score > withoutEvent.scored.score,
  );
});

test("ett bolagsnamn utan användbara ord ger inga träffar alls", () => {
  // Skyddar mot att en skräprad i en import blir en bevakning som matchar allt.
  const result = scoreHit(hit(), "AB");

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "no-usable-company-tokens");
});

test("rankningen sätter det mest relevanta först", () => {
  const decision = filterAndRankHits(
    [
      hit({
        title: "Ljusdalsföretag nämns",
        url: "https://a.se/1",
        snippet: "Ingen händelse.",
      }),
      hit({ url: "https://b.se/2" }),
    ],
    COMPANY,
  );

  assert.equal(decision.kept[0].url, "https://b.se/2");
  assert.equal(decision.highConfidence.length, 1);
  assert.equal(decision.lowConfidence.length, 1);
});

test("de två graderna överlappar inte", () => {
  // Mejlet skickar highConfidence och dashboarden visar lowConfidence. Hamnar
  // en artikel i båda mejlas den och ligger kvar som obedömd.
  const decision = filterAndRankHits(
    [hit(), hit({ title: "Ljusdalsföretag", url: "https://c.se/3" })],
    COMPANY,
  );

  const overlap = decision.highConfidence.filter((entry) =>
    decision.lowConfidence.some((other) => other.url === entry.url),
  );

  assert.deepEqual(overlap, []);
  assert.equal(
    decision.highConfidence.length + decision.lowConfidence.length,
    decision.kept.length,
  );
});
