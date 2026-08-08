import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeAuthTokenFailure,
  generateTokenSecret,
  hashTokenSecret,
} from "./authTokenSecret.ts";

/**
 * Bara de delar som går att pröva utan databas. `createAuthToken` och
 * `consumeAuthToken` kräver Prisma och verifieras i produktion i stället — se
 * ARBETSLOGG.md.
 */

test("hemligheten är URL-säker och tillräckligt lång", () => {
  // En länk som radbryts i en mejlklient är en länk som inte går att klicka
  // på, och tecken som måste procentkodas är precis det som orsakar det.
  for (let i = 0; i < 50; i += 1) {
    const secret = generateTokenSecret();

    assert.equal(secret.length, 32);
    assert.match(secret, /^[A-Za-z0-9_-]+$/, `"${secret}" är inte URL-säker`);
  }
});

test("två hemligheter är aldrig lika", () => {
  const secrets = new Set(
    Array.from({ length: 500 }, () => generateTokenSecret()),
  );

  assert.equal(secrets.size, 500);
});

test("samma hemlighet ger samma hash", () => {
  // Uppslagningen slår på hashen, så den måste vara deterministisk. Ett salt
  // här hade gjort tokens omöjliga att hitta.
  const secret = generateTokenSecret();

  assert.equal(hashTokenSecret(secret), hashTokenSecret(secret));
});

test("olika hemligheter ger olika hash", () => {
  assert.notEqual(
    hashTokenSecret(generateTokenSecret()),
    hashTokenSecret(generateTokenSecret()),
  );
});

test("hashen avslöjar inte hemligheten", () => {
  // Kärnan i skyddet: den som får läsa tabellen ska inte kunna logga in som
  // någon annan. Samma skäl som att lösenord inte lagras i klartext.
  const secret = generateTokenSecret();
  const hash = hashTokenSecret(secret);

  assert.notEqual(hash, secret);
  assert.equal(hash.includes(secret), false);
  assert.match(hash, /^[A-Za-z0-9_-]+$/);
});

test("varje utfall har ett begripligt besked", () => {
  // Beskeden skiljer på "länken är slut" och "länken var aldrig giltig",
  // eftersom råden är olika.
  const beskrivningar = (
    ["saknas", "ogiltig", "utgangen", "forbrukad"] as const
  ).map(describeAuthTokenFailure);

  for (const text of beskrivningar) {
    assert.ok(text.length > 0);
    // Inga tekniska termer läcker ut till användaren.
    assert.doesNotMatch(text, /token|hash|null|undefined/i);
  }

  assert.equal(new Set(beskrivningar).size, 4, "beskeden ska skilja sig åt");
});
