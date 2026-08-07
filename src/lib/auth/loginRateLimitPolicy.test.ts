import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateLoginRateLimit,
  normalizeIdentifier,
  type RateLimitDeps,
} from "./loginRateLimitPolicy.ts";

const NOW = new Date("2026-08-07T15:00:00.000Z");

function deps(perIdentifier: number, global: number): RateLimitDeps {
  return {
    countForIdentifier: async () => perIdentifier,
    countGlobal: async () => global,
  };
}

test("under båda taken släpps igenom", async () => {
  const verdict = await evaluateLoginRateLimit("a@b.se", NOW, deps(4, 99));

  assert.equal(verdict.allowed, true);
});

test("femte försöket från samma adress är det sista som går igenom", async () => {
  assert.equal((await evaluateLoginRateLimit("a@b.se", NOW, deps(4, 0))).allowed, true);
  assert.equal((await evaluateLoginRateLimit("a@b.se", NOW, deps(5, 0))).allowed, false);
});

test("taket per adress rapporteras skilt från det globala", async () => {
  const verdict = await evaluateLoginRateLimit("a@b.se", NOW, deps(5, 0));

  assert.equal(verdict.allowed, false);
  if (!verdict.allowed) {
    assert.equal(verdict.reason, "per-identifier");
  }
});

test("det globala taket väger tyngre än det per adress", async () => {
  // Är tjänsten under attack spelar det ingen roll vilken adress begäran
  // gäller — och skälet som rapporteras styr om användaren får ett kvitto
  // eller ett felmeddelande, så förväxlingen skulle synas.
  const verdict = await evaluateLoginRateLimit("ny@adress.se", NOW, deps(0, 100));

  assert.equal(verdict.allowed, false);
  if (!verdict.allowed) {
    assert.equal(verdict.reason, "global");
  }
});

test("adressen normaliseras, annars kringgås taket med versaler", () => {
  assert.equal(normalizeIdentifier("  Oskar@Example.SE "), "oskar@example.se");
});

test("fönstret räknas bakåt från nu", async () => {
  let observed: Date | null = null;

  await evaluateLoginRateLimit("a@b.se", NOW, {
    countForIdentifier: async () => 0,
    countGlobal: async (since) => {
      observed = since;
      return 0;
    },
  });

  assert.equal(
    observed && (observed as Date).toISOString(),
    "2026-08-07T14:00:00.000Z",
  );
});
