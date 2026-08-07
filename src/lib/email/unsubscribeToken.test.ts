import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildUnsubscribeUrl,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribeToken.ts";

function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

const MED_HEMLIGHET = env({ AUTH_SECRET: "en-hemlighet-som-inte-ar-tom" });
const ANNAN_HEMLIGHET = env({ AUTH_SECRET: "en-helt-annan-hemlighet" });
const UTAN_HEMLIGHET = env({});

test("samma användare och hemlighet ger samma signatur", () => {
  const first = createUnsubscribeToken("user_1", MED_HEMLIGHET);
  const second = createUnsubscribeToken("user_1", MED_HEMLIGHET);

  assert.equal(first, second);
  assert.equal(first?.length, 32);
});

test("olika användare ger olika signatur", () => {
  // Kärnan i skyddet: den som fått sin egen länk ska inte kunna byta ut
  // användar-id:t i den och avregistrera någon annan.
  assert.notEqual(
    createUnsubscribeToken("user_1", MED_HEMLIGHET),
    createUnsubscribeToken("user_2", MED_HEMLIGHET),
  );
});

test("utan AUTH_SECRET blir det ingen signatur alls", () => {
  // Hellre ingen länk än en som inte fungerar. Se modulens kommentar.
  assert.equal(createUnsubscribeToken("user_1", UTAN_HEMLIGHET), null);
  assert.equal(buildUnsubscribeUrl("user_1", "https://x.se", UTAN_HEMLIGHET), null);
});

test("en giltig signatur godkänns", () => {
  const token = createUnsubscribeToken("user_1", MED_HEMLIGHET);

  assert.equal(verifyUnsubscribeToken("user_1", token, MED_HEMLIGHET), true);
});

test("signatur för fel användare avvisas", () => {
  const token = createUnsubscribeToken("user_2", MED_HEMLIGHET);

  assert.equal(verifyUnsubscribeToken("user_1", token, MED_HEMLIGHET), false);
});

test("signatur från en annan hemlighet avvisas", () => {
  const token = createUnsubscribeToken("user_1", ANNAN_HEMLIGHET);

  assert.equal(verifyUnsubscribeToken("user_1", token, MED_HEMLIGHET), false);
});

test("tom eller saknad signatur avvisas utan att kasta", () => {
  // Konstanttidsjämförelsen kastar på olika längd. Att den kontrollen sitter
  // före är skillnaden mellan ett nej och en 500 på en publik URL.
  assert.equal(verifyUnsubscribeToken("user_1", null, MED_HEMLIGHET), false);
  assert.equal(verifyUnsubscribeToken("user_1", "", MED_HEMLIGHET), false);
  assert.equal(verifyUnsubscribeToken("user_1", "kort", MED_HEMLIGHET), false);
  assert.equal(
    verifyUnsubscribeToken("user_1", "a".repeat(64), MED_HEMLIGHET),
    false,
  );
});

test("länken bär både användare och signatur", () => {
  const url = buildUnsubscribeUrl(
    "user_1",
    "https://foretagskollen.se",
    MED_HEMLIGHET,
  );

  assert.ok(url);
  const parsed = new URL(url);

  assert.equal(parsed.origin, "https://foretagskollen.se");
  assert.equal(parsed.pathname, "/avregistrera");
  assert.equal(parsed.searchParams.get("u"), "user_1");
  assert.equal(
    verifyUnsubscribeToken("user_1", parsed.searchParams.get("t"), MED_HEMLIGHET),
    true,
  );
});

test("utan basadress blir det ingen länk", () => {
  assert.equal(buildUnsubscribeUrl("user_1", null, MED_HEMLIGHET), null);
});
