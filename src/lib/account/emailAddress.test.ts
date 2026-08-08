import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeEmail } from "./emailAddress.ts";

test("adressen lagras i gemener och utan omgivande blanktecken", () => {
  // `User.email` är unik och skiftlägeskänslig i Postgres. Utan det här blir
  // Anna@ och anna@ två konton, och användaren loggar in på fel av dem.
  assert.equal(normalizeEmail("  Anna.Svensson@Exempel.SE "), "anna.svensson@exempel.se");
});

test("uppenbart trasiga adresser avvisas", () => {
  for (const trasig of ["", "   ", "utan-snabel", "två@delar@fel", "a@b", "@b.se", "a@.se"]) {
    assert.equal(normalizeEmail(trasig), null, `"${trasig}" borde avvisats`);
  }
});

test("adresser som inte går att leverera till avvisas", () => {
  // Ett byte hit gör kontot ostängbart: inloggningen är den magiska länken, så
  // en adress ingen post når betyder att ingen kommer in igen.
  assert.equal(normalizeEmail("dev@localhost"), null);
  assert.equal(normalizeEmail("nagon@example.com"), null);
});

test("annat än strängar avvisas", () => {
  // FormData kan lämna en File om formuläret ändras. Det får inte bli en
  // adress genom en implicit strängkonvertering.
  assert.equal(normalizeEmail(undefined), null);
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizeEmail(42), null);
});

test("en orimligt lång adress avvisas", () => {
  assert.equal(normalizeEmail(`${"a".repeat(250)}@exempel.se`), null);
});

test("ovanliga men giltiga adresser släpps igenom", () => {
  // Valideringen är med flit tunn. Adressens riktiga prov är att
  // bekräftelsemejlet kommer fram, och en strängare regel avvisar bara
  // udda-men-riktiga adresser med ett fel som är obegripligt för den som äger
  // dem.
  assert.equal(normalizeEmail("a+b@under.doman.co.uk"), "a+b@under.doman.co.uk");
  assert.equal(normalizeEmail("förnamn@räksmörgås.se"), "förnamn@räksmörgås.se");
});
