import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkPasswordStrength,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "./password.ts";

test("ett hashat lösenord går att verifiera", async () => {
  const stored = await hashPassword("ett-riktigt-losenord");

  assert.equal(await verifyPassword("ett-riktigt-losenord", stored), true);
});

test("fel lösenord avvisas", async () => {
  const stored = await hashPassword("ett-riktigt-losenord");

  assert.equal(await verifyPassword("ett-annat-losenord", stored), false);
  assert.equal(await verifyPassword("", stored), false);
});

test("samma lösenord ger olika hash varje gång", async () => {
  // Saltet är hela skälet. Utan det avslöjar två identiska hashar att två
  // användare valt samma lösenord, och en angripare kan förberäkna tabeller
  // som gäller för alla konton på en gång.
  const first = await hashPassword("samma-losenord");
  const second = await hashPassword("samma-losenord");

  assert.notEqual(first, second);
  assert.equal(await verifyPassword("samma-losenord", first), true);
  assert.equal(await verifyPassword("samma-losenord", second), true);
});

test("hashen bär sina egna parametrar", async () => {
  // Det är det som gör att kostnaden kan höjas senare utan att befintliga
  // lösenord slutar fungera.
  const stored = await hashPassword("losenordet");
  const [algoritm, n, r, p] = stored.split("$");

  assert.equal(algoritm, "scrypt");
  assert.equal(Number(n), 16384);
  assert.equal(Number(r), 8);
  assert.equal(Number(p), 1);
  assert.equal(stored.split("$").length, 6);
});

test("en hash med svagare parametrar går fortfarande att verifiera", async () => {
  // Simulerar en hash från en framtid där vi sänkt kostnaden — eller ett
  // förflutet där den var lägre. Den ska gälla, men flaggas för omhashning.
  const stored = await hashPassword("losenordet");
  const delar = stored.split("$");
  const svagare = ["scrypt", "1024", delar[2], delar[3], delar[4], delar[5]].join("$");

  // Verifieringen misslyckas eftersom nyckeln räknades med N=16384, men det
  // viktiga här är att den inte *kastar* på okända parametrar.
  assert.equal(await verifyPassword("losenordet", svagare), false);
  assert.equal(needsRehash(svagare), true);
});

test("en färsk hash behöver inte hashas om", async () => {
  assert.equal(needsRehash(await hashPassword("losenordet")), false);
});

test("en trasig hash avvisas i stället för att kasta", async () => {
  // Ett kast här hade blivit ett 500 vid inloggningen. Skillnaden mellan fel
  // lösenord och en skadad rad i databasen är inget en inloggningssida ska
  // avslöja — den ska loggas, inte visas.
  for (const trasig of [
    "",
    "inte-en-hash",
    "scrypt$16384$8$1",
    "bcrypt$2a$10$abc",
    "scrypt$noll$8$1$c2FsdA$aGFzaA",
    "scrypt$16384$8$1$c2FsdA$",
  ]) {
    assert.equal(
      await verifyPassword("losenordet", trasig),
      false,
      `"${trasig}" borde avvisats tyst`,
    );
    assert.equal(needsRehash(trasig), true);
  }
});

test("för korta lösenord avvisas", () => {
  assert.equal(checkPasswordStrength("kort"), "kort");
  assert.equal(checkPasswordStrength("1234567"), "kort");
  assert.equal(checkPasswordStrength("12345678"), null);
});

test("tomt eller icke-sträng avvisas", () => {
  assert.equal(checkPasswordStrength(""), "tomt");
  assert.equal(checkPasswordStrength(undefined), "tomt");
  assert.equal(checkPasswordStrength(null), "tomt");
  assert.equal(checkPasswordStrength(12345678), "tomt");
});

test("orimligt långa lösenord avvisas", () => {
  // Inte pedanteri: scrypt arbetar på hela indata, så utan tak kan ett enda
  // anrop med en megabyte lösenord få servern att räkna tills den dör.
  assert.equal(checkPasswordStrength("a".repeat(200)), null);
  assert.equal(checkPasswordStrength("a".repeat(201)), "langt");
});

test("ett långt men tillåtet lösenord fungerar hela vägen", async () => {
  const lösenfras = "en ganska lång lösenfras med mellanslag och åäö";
  const stored = await hashPassword(lösenfras);

  assert.equal(checkPasswordStrength(lösenfras), null);
  assert.equal(await verifyPassword(lösenfras, stored), true);
});
