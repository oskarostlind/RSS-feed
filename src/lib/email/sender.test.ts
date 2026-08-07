import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSender } from "./sender.ts";

test("utan EMAIL_FROM används sandlådedomänen", () => {
  const sender = resolveSender(undefined);

  assert.equal(sender.from, "Omvärldsbevakare <onboarding@resend.dev>");
  assert.equal(sender.isVerifiedDomain, false);
});

test("tom sträng räknas som osatt, inte som tom avsändare", () => {
  // Vercels gränssnitt sparar gärna en variabel med bara blanksteg i.
  assert.equal(resolveSender("   ").isVerifiedDomain, false);
});

test("naken adress får avsändarnamn påklistrat", () => {
  // Att tyst tappa namnet vore att återinföra precis det fel som gjorde att
  // Gmail kastade inloggningsmejlen 2026-08-07.
  const sender = resolveSender("notiser@mail.foretagskollen.se");

  assert.equal(sender.from, "Företagskollen <notiser@mail.foretagskollen.se>");
  assert.equal(sender.isVerifiedDomain, true);
});

test("full form lämnas orörd", () => {
  const sender = resolveSender("Kundtjänst <hej@mail.foretagskollen.se>");

  assert.equal(sender.from, "Kundtjänst <hej@mail.foretagskollen.se>");
  assert.equal(sender.isVerifiedDomain, true);
});

test("resend.dev räknas aldrig som verifierad, hur den än skrivs", () => {
  assert.equal(
    resolveSender("Namn <nagot@resend.dev>").isVerifiedDomain,
    false,
  );
});
