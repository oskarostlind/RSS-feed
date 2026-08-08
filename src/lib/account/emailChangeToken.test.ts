import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEmailChangeUrl,
  createEmailChangeToken,
  isEmailChangeExpired,
  parseExpiresAt,
  verifyEmailChangeToken,
  type EmailChangeClaim,
} from "./emailChangeToken.ts";

function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

const MED_HEMLIGHET = env({ AUTH_SECRET: "en-hemlighet-som-inte-ar-tom" });
const ANNAN_HEMLIGHET = env({ AUTH_SECRET: "en-helt-annan-hemlighet" });
const UTAN_HEMLIGHET = env({});

const ANSPRAK: EmailChangeClaim = {
  userId: "user_1",
  currentEmail: "gammal@exempel.se",
  newEmail: "ny@exempel.se",
  expiresAt: 1_800_000_000_000,
};

test("samma anspråk och hemlighet ger samma signatur", () => {
  const first = createEmailChangeToken(ANSPRAK, MED_HEMLIGHET);
  const second = createEmailChangeToken(ANSPRAK, MED_HEMLIGHET);

  assert.equal(first, second);
  assert.equal(first?.length, 32);
});

test("varje del av anspråket ingår i signaturen", () => {
  // Kärnan i skyddet. Går någon av dessa att ändra utan att signaturen bryts
  // kan den som fått en giltig länk skriva om den till ett annat konto, en
  // annan måladress eller en längre giltighetstid.
  const bas = createEmailChangeToken(ANSPRAK, MED_HEMLIGHET);

  for (const ändring of [
    { userId: "user_2" },
    { currentEmail: "nagon.annan@exempel.se" },
    { newEmail: "angripare@exempel.se" },
    { expiresAt: ANSPRAK.expiresAt + 1 },
  ]) {
    assert.notEqual(
      createEmailChangeToken({ ...ANSPRAK, ...ändring }, MED_HEMLIGHET),
      bas,
      `${Object.keys(ändring)[0]} ingår inte i signaturen`,
    );
  }
});

test("fälten går inte att skifta mellan varandra", () => {
  // Utan avgränsare skulle "ab" + "c" och "a" + "bc" bli samma sträng att
  // signera. Adresser kan inte innehålla radbrytning, vilket är varför den
  // valdes som avgränsare — det här testet är det som håller det sant.
  assert.notEqual(
    createEmailChangeToken(
      { ...ANSPRAK, currentEmail: "a@x.se", newEmail: "bb@x.se" },
      MED_HEMLIGHET,
    ),
    createEmailChangeToken(
      { ...ANSPRAK, currentEmail: "a@x.seb", newEmail: "b@x.se" },
      MED_HEMLIGHET,
    ),
  );
});

test("en annan hemlighet ger en annan signatur", () => {
  assert.notEqual(
    createEmailChangeToken(ANSPRAK, MED_HEMLIGHET),
    createEmailChangeToken(ANSPRAK, ANNAN_HEMLIGHET),
  );
});

test("utan AUTH_SECRET blir det varken signatur eller länk", () => {
  // Hellre inget bekräftelsemejl än ett med en länk som inte fungerar — se
  // modulens kommentar.
  assert.equal(createEmailChangeToken(ANSPRAK, UTAN_HEMLIGHET), null);
  assert.equal(
    buildEmailChangeUrl(ANSPRAK, "https://kundnytt.se", UTAN_HEMLIGHET),
    null,
  );
});

test("utan känd basadress byggs ingen länk", () => {
  assert.equal(buildEmailChangeUrl(ANSPRAK, null, MED_HEMLIGHET), null);
});

test("en giltig signatur godkänns", () => {
  const token = createEmailChangeToken(ANSPRAK, MED_HEMLIGHET);

  assert.equal(verifyEmailChangeToken(ANSPRAK, token, MED_HEMLIGHET), true);
});

test("signaturen slutar gälla när adressen redan bytts", () => {
  // Det som gör länken engångs utan att vi håller reda på förbrukning: efter
  // bytet är kontots nuvarande adress den nya, och samma länk verifierar inte
  // längre. En gammal länk kan alltså inte rulla tillbaka ett senare byte.
  const token = createEmailChangeToken(ANSPRAK, MED_HEMLIGHET);

  assert.equal(
    verifyEmailChangeToken(
      { ...ANSPRAK, currentEmail: ANSPRAK.newEmail },
      token,
      MED_HEMLIGHET,
    ),
    false,
  );
});

test("en signatur av fel längd avvisas utan att kasta", () => {
  // timingSafeEqual kastar på olika längd. Ett kast här hade blivit ett 500
  // i stället för ett vänligt "länken gäller inte längre".
  assert.equal(verifyEmailChangeToken(ANSPRAK, "kort", MED_HEMLIGHET), false);
  assert.equal(verifyEmailChangeToken(ANSPRAK, null, MED_HEMLIGHET), false);
});

test("utgångstiden avgör giltigheten", () => {
  assert.equal(isEmailChangeExpired(1_000, 999), false);
  assert.equal(isEmailChangeExpired(1_000, 1_000), true);
  assert.equal(isEmailChangeExpired(1_000, 1_001), true);
});

test("en oläsbar utgångstid räknas som utgången", () => {
  // Skräp i URL:en får aldrig bli en länk som gäller för alltid.
  assert.equal(isEmailChangeExpired(Number.NaN, 0), true);
  assert.equal(parseExpiresAt("inte-ett-tal"), null);
  assert.equal(parseExpiresAt(undefined), null);
  assert.equal(parseExpiresAt("-1"), null);
  assert.equal(parseExpiresAt("1800000000000"), 1_800_000_000_000);
});

test("länken bär allt som behövs för att verifiera den", () => {
  const url = buildEmailChangeUrl(ANSPRAK, "https://kundnytt.se", MED_HEMLIGHET);
  const params = new URL(url ?? "").searchParams;

  assert.equal(new URL(url ?? "").pathname, "/byt-mejl");
  assert.equal(params.get("u"), ANSPRAK.userId);
  assert.equal(params.get("e"), ANSPRAK.newEmail);
  assert.equal(params.get("x"), String(ANSPRAK.expiresAt));
  assert.equal(
    params.get("t"),
    createEmailChangeToken(ANSPRAK, MED_HEMLIGHET),
  );
});
