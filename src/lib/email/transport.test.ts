import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSmtpSettings } from "./transport.ts";

function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

test("alla fyra satta ger SMTP", () => {
  const settings = resolveSmtpSettings(
    env({
      SMTP_HOST: "smtp-relay.brevo.com",
      SMTP_PORT: "587",
      SMTP_USER: "anvandare",
      SMTP_PASS: "hemlighet",
    }),
  );

  assert.deepEqual(settings, {
    host: "smtp-relay.brevo.com",
    port: 587,
    user: "anvandare",
    pass: "hemlighet",
  });
});

test("halv konfiguration ger null, inte en trasig transport", () => {
  // Det farliga fallet. En halv SMTP-konfiguration ser konfigurerad ut och
  // fallerar först vid utskick, alltså kl 07 när ingen tittar. Bättre att
  // falla tillbaka på den väg som bevisligen fungerar.
  assert.equal(
    resolveSmtpSettings(env({ SMTP_HOST: "smtp.example.com" })),
    null,
  );
  assert.equal(
    resolveSmtpSettings(
      env({ SMTP_HOST: "smtp.example.com", SMTP_USER: "u" }),
    ),
    null,
  );
  assert.equal(resolveSmtpSettings(env({})), null);
});

test("blanksteg räknas som osatt", () => {
  assert.equal(
    resolveSmtpSettings(
      env({ SMTP_HOST: "  ", SMTP_USER: "u", SMTP_PASS: "p" }),
    ),
    null,
  );
});

test("saknad eller trasig port blir 587", () => {
  // 587 med STARTTLS är vad Brevo och de flesta andra vill ha. Att gissa fel
  // ger en hängande anslutning snarare än ett tydligt fel.
  const utan = resolveSmtpSettings(
    env({ SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p" }),
  );
  const trasig = resolveSmtpSettings(
    env({ SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p", SMTP_PORT: "abc" }),
  );

  assert.equal(utan?.port, 587);
  assert.equal(trasig?.port, 587);
});

test("port 465 respekteras", () => {
  const settings = resolveSmtpSettings(
    env({ SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p", SMTP_PORT: "465" }),
  );

  assert.equal(settings?.port, 465);
});
