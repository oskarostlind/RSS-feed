/**
 * Avsändaradressen, på ett ställe.
 *
 * Låg tidigare hårdkodad på två — `auth.ts` för inloggningsmejlet och
 * `EmailService.ts` för morgonmejl och larm. Två ställen betyder att bytet till
 * en egen domän kan göras halvt, och ett inloggningsmejl som fortfarande kommer
 * från sandlådedomänen är precis det mejl som inte får hamna i skräpposten.
 *
 * Styrs med `EMAIL_FROM` så att domänbytet inte kräver en deploy. Det spelar
 * roll här mer än vanligt: DNS-poster slår igenom när de slår igenom, och man
 * vill kunna byta avsändare i samma stund som Resend säger verified.
 */

/**
 * Resends delade sandlådedomän. Levererar bara till kontots egen adress, och
 * mätning 2026-08-07 visade att inloggningsmejlen därifrån kastades av Gmail
 * utan att ens hamna i skräpposten. Duger till utveckling, inte till drift.
 */
const SANDBOX_FROM = "Företagskollen <onboarding@resend.dev>";

/**
 * Namnet syns i mejllistan och är det enda mottagaren känner igen innan hen
 * öppnat. Utan det stod det bara "onboarding".
 */
const DISPLAY_NAME = "Företagskollen";

export interface SenderStatus {
  /** Adressen som faktiskt används, färdig för `from`. */
  from: string;
  /** Falskt när vi fortfarande sitter på sandlådedomänen. */
  isVerifiedDomain: boolean;
}

export function resolveSender(
  raw: string | undefined = process.env.EMAIL_FROM,
): SenderStatus {
  const configured = raw?.trim();

  if (!configured) {
    return { from: SANDBOX_FROM, isVerifiedDomain: false };
  }

  // Tillåter både "namn <adress>" och en naken adress. Den nakna formen är
  // lätt att råka skriva in i Vercels gränssnitt, och att tyst tappa
  // avsändarnamnet vore att återinföra felet variabeln finns för att lösa.
  const from = configured.includes("<")
    ? configured
    : `${DISPLAY_NAME} <${configured}>`;

  return {
    from,
    isVerifiedDomain: !configured.includes("resend.dev"),
  };
}

export function resolveFromAddress(
  raw: string | undefined = process.env.EMAIL_FROM,
): string {
  return resolveSender(raw).from;
}
