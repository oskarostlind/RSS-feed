import assert from "node:assert/strict";
import test from "node:test";
import {
  isSignInAllowed,
  resolveSignupAllowlist,
  resolveSignupMode,
} from "@/lib/auth/signupPolicy";

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

test("förvalet är öppet när SIGNUP_MODE saknas", () => {
  assert.equal(resolveSignupMode(env({})), "open");
});

test("ett stavfel stänger inte tjänsten", () => {
  // Det viktiga är riktningen på felet: ett okänt värde ska betyda öppet, inte
  // stängt. Ett stavfel som låser ute alla upptäcks först när någon klagar.
  assert.equal(resolveSignupMode(env({ SIGNUP_MODE: "invtie" })), "open");
});

test("invite och closed känns igen oavsett versaler", () => {
  assert.equal(resolveSignupMode(env({ SIGNUP_MODE: "Invite" })), "invite");
  assert.equal(resolveSignupMode(env({ SIGNUP_MODE: " CLOSED " })), "closed");
});

test("listan tål mellanslag, versaler och tomma poster", () => {
  const lista = resolveSignupAllowlist(
    env({ SIGNUP_ALLOWLIST: " Anna@Exempel.se ,, bo@exempel.se," }),
  );

  assert.equal(lista.size, 2);
  assert.ok(lista.has("anna@exempel.se"));
  assert.ok(lista.has("bo@exempel.se"));
});

test("befintlig användare släpps alltid in, även i closed", () => {
  assert.ok(
    isSignInAllowed("anna@exempel.se", true, env({ SIGNUP_MODE: "closed" })),
  );
});

test("closed nekar en ny adress", () => {
  assert.equal(
    isSignInAllowed("ny@exempel.se", false, env({ SIGNUP_MODE: "closed" })),
    false,
  );
});

test("invite släpper in den inbjudna och nekar andra", () => {
  const miljo = env({
    SIGNUP_MODE: "invite",
    SIGNUP_ALLOWLIST: "anna@exempel.se",
  });

  assert.ok(isSignInAllowed("Anna@Exempel.se", false, miljo));
  assert.equal(isSignInAllowed("bo@exempel.se", false, miljo), false);
});

test("invite utan lista nekar alla nya", () => {
  // En tom lista i invite-läge är samma sak som stängt. Det är avsiktligt:
  // alternativet vore att en glömd variabel öppnar tjänsten för alla.
  assert.equal(
    isSignInAllowed("ny@exempel.se", false, env({ SIGNUP_MODE: "invite" })),
    false,
  );
});

test("open släpper in vem som helst", () => {
  assert.ok(isSignInAllowed("ny@exempel.se", false, env({})));
});
