import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveShardCount, splitIntoShards } from "./discoveryShards.ts";

test("förvalet är en del, alltså dagens beteende", () => {
  // Det viktigaste testet i filen. Blir förvalet något annat än 1 börjar
  // morgonjobbet anropa sig själv utan att någon bett om det.
  assert.equal(resolveShardCount(undefined), 1);
  assert.equal(resolveShardCount(""), 1);
});

test("skräp i variabeln ger en del, inte noll delar", () => {
  // Noll delar hade betytt att ingenting söktes — ett stavfel i en
  // miljövariabel får inte tysta bevakningen.
  for (const raw of ["abc", "0", "-3", "NaN"]) {
    assert.equal(resolveShardCount(raw), 1, `"${raw}" borde gett 1`);
  }
});

test("antalet delar har ett tak", () => {
  // Varje del multiplicerar de samtidiga anropen mot samma källor. Strypning
  // kostar täckning, och täckning är det vi minst har råd att förlora.
  assert.equal(resolveShardCount("4"), 4);
  assert.equal(resolveShardCount("50"), 4);
  assert.equal(resolveShardCount("2.9"), 2);
});

test("en del ger listan orörd och inget nätverksanrop att göra", () => {
  assert.deepEqual(splitIntoShards([1, 2, 3], 1), [[1, 2, 3]]);
});

test("inga bolag ger inga delar", () => {
  assert.deepEqual(splitIntoShards([], 1), []);
  assert.deepEqual(splitIntoShards([], 3), []);
});

test("bolagen varvas mellan delarna i stället för att blockas", () => {
  // Listan kommer sorterad äldst kontrollerad först. Ett blockvis snitt hade
  // lagt alla mest eftersatta bolag i samma del — den som redan har mest att
  // göra. Samordnaren väntar på den långsammaste delen, så ojämn fördelning
  // kostar hela körningen tid.
  assert.deepEqual(splitIntoShards([1, 2, 3, 4, 5, 6, 7], 3), [
    [1, 4, 7],
    [2, 5],
    [3, 6],
  ]);
});

test("varje bolag hamnar i exakt en del", () => {
  // Ett bolag i två delar söks två gånger samma morgon; ett i noll delar
  // hoppas tyst över. Båda är precis den sortens fel som inte syns.
  const bolag = Array.from({ length: 23 }, (_, index) => index);
  const delar = splitIntoShards(bolag, 4);

  assert.deepEqual([...delar.flat()].sort((a, b) => a - b), bolag);
});

test("färre bolag än delar ger inga tomma anrop", () => {
  assert.deepEqual(splitIntoShards([1, 2], 4), [[1], [2]]);
});
