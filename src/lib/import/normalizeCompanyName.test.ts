import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyNonCompanyValue,
  cleanImportedName,
  companyMatchKey,
} from "./normalizeCompanyName.ts";

test("samma bolag skrivet på olika sätt får samma nyckel", () => {
  // Varje par här är två bevakningar av ett bolag, alltså dubbla mejl om varje
  // nyhet — den konkreta skadan målbilden pekar ut.
  const pairs: [string, string][] = [
    ["Peges i Ljusdal AB", "Peges Ljusdal"],
    ["Pohjanen & Ström Transport", "Pohjanen och Ström Transport"],
    ["AB Volvo", "Volvo AB"],
    ["Schlötter  Svenska AB", '"Schlötter Svenska"'],
  ];

  for (const [left, right] of pairs) {
    assert.equal(
      companyMatchKey(left),
      companyMatchKey(right),
      `${left} ≠ ${right}`,
    );
  }
});

test("olika bolag får inte samma nyckel", () => {
  assert.notEqual(companyMatchKey("Nord Ström AB"), companyMatchKey("Ström Nord AB"));
  assert.notEqual(companyMatchKey("H&M"), companyMatchKey("3M"));
});

test("korta varumärken får en nyckel trots att orden är för korta", () => {
  // Utan fallbacken blir nyckeln tom, och två tomma nycklar är dubbletter av
  // varandra — H&M hade svalt nästa lika korta namn i filen.
  assert.notEqual(companyMatchKey("H&M"), "");
});

test("celler från grannkolumnen känns igen på vad de är", () => {
  assert.equal(classifyNonCompanyValue("info@volvo.se"), "email");
  assert.equal(classifyNonCompanyValue("https://volvo.se"), "url");
  assert.equal(classifyNonCompanyValue("556036-0793"), "orgnr");
  assert.equal(classifyNonCompanyValue("070-123 45 67"), "phone");
  assert.equal(classifyNonCompanyValue("2026-08-08"), "date");
  assert.equal(classifyNonCompanyValue("1 234,50"), "number");
  assert.equal(classifyNonCompanyValue("Summa"), "header");
});

test("bolagsformen ensam är inget bolagsnamn", () => {
  // En bevakning på "AB" söker efter en fras som förekommer i varannan svensk
  // artikel, varje morgon, för alltid.
  assert.equal(classifyNonCompanyValue("AB"), "no-tokens");
  assert.equal(classifyNonCompanyValue("och"), "no-tokens");
  assert.equal(classifyNonCompanyValue("-"), "number");
});

test("initialer med och-tecken är ett riktigt namn", () => {
  assert.equal(classifyNonCompanyValue("H&M"), null);
  assert.equal(classifyNonCompanyValue("Volvo AB"), null);
});

test("städningen tar bort osynliga tecken och avslutande skiljetecken", () => {
  assert.equal(cleanImportedName(" Volvo AB,​"), "Volvo AB");
});
