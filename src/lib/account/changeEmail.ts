import { headers } from "next/headers";
import { resolveAppBaseUrlFromHost } from "@/lib/appUrl";
import { normalizeEmail } from "@/lib/account/emailAddress";
import {
  buildEmailChangeUrl,
  EMAIL_CHANGE_TTL_MS,
  isEmailChangeExpired,
  verifyEmailChangeToken,
  type EmailChangeClaim,
} from "@/lib/account/emailChangeToken";
import { resolveFromAddress } from "@/lib/email/sender";
import { sendEmail } from "@/lib/email/transport";
import { prisma } from "@/lib/prisma";

/**
 * Byte av mejladress, i två steg.
 *
 * Steg ett sker inloggad och skickar en bekräftelselänk till den **nya**
 * adressen. Steg två sker när någon klickar på länken, och är det som faktiskt
 * flyttar kontot. Se `emailChangeToken.ts` för varför bytet inte får ske
 * direkt: adressen är kontots enda nyckel, och en felstavning som slår igenom
 * med en gång är inte något användaren kan ta sig ur själv.
 */

export type EmailChangeFailure =
  | "format"
  | "samma"
  | "tagen"
  | "hemlighet"
  | "adress"
  | "utskick"
  | "lank"
  | "utgangen"
  | "fel";

export type RequestEmailChangeResult =
  | { ok: true; sentTo: string }
  | { ok: false; reason: EmailChangeFailure };

export type ConfirmEmailChangeResult =
  | { ok: true; email: string }
  | { ok: false; reason: EmailChangeFailure };

function buildConfirmationText(newEmail: string, url: string): string {
  return [
    "Bekräfta din nya mejladress",
    "",
    `Någon har bett om att flytta ett Kundnytt-konto till ${newEmail}.`,
    "Öppna länken nedan för att bekräfta. Den är giltig i en timme.",
    "",
    url,
    "",
    "Fram tills du bekräftar ligger kontot kvar på den gamla adressen.",
    "Har du inte begärt det här kan du bortse från mejlet — ingenting händer.",
  ].join("\n");
}

function buildConfirmationHtml(newEmail: string, url: string): string {
  return `<!DOCTYPE html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bekräfta din nya mejladress</title>
  </head>
  <body style="margin: 0; padding: 32px 16px; background-color: #f4f4f5; font-family: Arial, Helvetica, sans-serif; color: #18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px;">
            <tr>
              <td style="padding: 32px 28px;">
                <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #71717a;">
                  Kundnytt
                </p>
                <h1 style="margin: 0 0 12px 0; font-size: 24px; line-height: 1.3; color: #18181b;">
                  Bekräfta din nya mejladress
                </h1>
                <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #52525b;">
                  Någon har bett om att flytta ett Kundnytt-konto till
                  ${newEmail}. Klicka nedan för att bekräfta. Länken är giltig i
                  en timme, och fram tills dess ligger kontot kvar på den gamla
                  adressen.
                </p>
                <a href="${url}" style="display: inline-block; border-radius: 8px; background-color: #18181b; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 20px;">
                  Bekräfta adressen
                </a>
                <p style="margin: 24px 0 0 0; font-size: 12px; line-height: 1.5; color: #a1a1aa;">
                  Har du inte begärt det här kan du ignorera mejlet. Ingenting händer.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Tjänstens publika adress, härledd ur den pågående requesten.
 *
 * Ligger här och inte i anroparen därför att serverfunktioner inte får någon
 * `Request` — se `resolveAppBaseUrlFromHost`.
 */
async function resolveBaseUrl(): Promise<string | null> {
  const headerList = await headers();

  return resolveAppBaseUrlFromHost(
    headerList.get("x-forwarded-host") ?? headerList.get("host"),
    headerList.get("x-forwarded-proto"),
  );
}

/**
 * Steg ett: skicka bekräftelselänken till den nya adressen.
 *
 * Kräver en inloggad användare — anroparen har redan hämtat id:t ur sessionen.
 */
export async function requestEmailChange(
  userId: string,
  rawNewEmail: unknown,
): Promise<RequestEmailChangeResult> {
  const newEmail = normalizeEmail(rawNewEmail);

  if (!newEmail) {
    return { ok: false, reason: "format" };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user) {
    return { ok: false, reason: "fel" };
  }

  const currentEmail = user.email.trim().toLowerCase();

  if (currentEmail === newEmail) {
    return { ok: false, reason: "samma" };
  }

  // Kontrolleras här *och* vid bekräftelsen. Här för att användaren ska få
  // veta med en gång i stället för efter ett mejl och ett klick; där för att
  // adressen kan ha tagits av någon annan under timmen däremellan.
  //
  // Att beskedet avslöjar att adressen har ett konto är medvetet. Den som
  // frågar är redan inloggad, så det är ingen väg att kartlägga användare
  // utifrån — och alternativet är att skicka ett mejl som leder till en
  // återvändsgränd.
  const taken = await prisma.user.findUnique({
    where: { email: newEmail },
    select: { id: true },
  });

  if (taken) {
    return { ok: false, reason: "tagen" };
  }

  const claim: EmailChangeClaim = {
    userId,
    currentEmail,
    newEmail,
    expiresAt: Date.now() + EMAIL_CHANGE_TTL_MS,
  };

  const baseUrl = await resolveBaseUrl();
  const url = buildEmailChangeUrl(claim, baseUrl);

  if (!url) {
    // Två olika orsaker, ett gemensamt utfall: utan hemlighet eller utan känd
    // publik adress går det inte att bygga en länk som fungerar. Skilj dem åt i
    // beskedet, eftersom den ena är en miljövariabel som saknas och den andra
    // är en felkonfigurerad adress.
    console.error(
      `Kunde inte bygga bekräftelselänk för adressbyte (bas: ${baseUrl ?? "saknas"}).`,
    );
    return { ok: false, reason: baseUrl ? "hemlighet" : "adress" };
  }

  try {
    await sendEmail({
      from: resolveFromAddress(),
      to: newEmail,
      subject: "Bekräfta din nya mejladress i Kundnytt",
      html: buildConfirmationHtml(newEmail, url),
      // Textdel av samma skäl som i inloggningsmejlet: ett HTML-bara mejl var
      // det Gmail kastade 2026-08-07, se PROJECT.md avsnitt 6.
      text: buildConfirmationText(newEmail, url),
    });
  } catch (error) {
    console.error(`Kunde inte skicka bekräftelsemejl till ${newEmail}:`, error);
    return { ok: false, reason: "utskick" };
  }

  return { ok: true, sentTo: newEmail };
}

/**
 * Steg två: genomför bytet.
 *
 * Kräver **ingen** session. Behörigheten ligger i signaturen, och beviset som
 * betyder något är att mottagaren nådde mejlet på den nya adressen — det är
 * precis vad bytet handlar om. Att dessutom kräva inloggning skulle betyda att
 * bytet bara går att slutföra i samma webbläsare som startade det, vilket är
 * fel antagande när mejl oftast öppnas i telefonen.
 */
export async function confirmEmailChange(params: {
  userId: unknown;
  newEmail: unknown;
  expiresAt: number | null;
  token: unknown;
}): Promise<ConfirmEmailChangeResult> {
  const userId = typeof params.userId === "string" ? params.userId : null;
  const newEmail = normalizeEmail(params.newEmail);
  const token = typeof params.token === "string" ? params.token : null;

  if (!userId || !newEmail || !token || params.expiresAt === null) {
    return { ok: false, reason: "lank" };
  }

  if (isEmailChangeExpired(params.expiresAt)) {
    return { ok: false, reason: "utgangen" };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user) {
    return { ok: false, reason: "lank" };
  }

  const currentEmail = user.email.trim().toLowerCase();

  // Har bytet redan gjorts verifierar signaturen inte längre, eftersom den
  // räknas över den *dåvarande* adressen. Det fallet är inte ett fel utan en
  // omladdning av bekräftelsesidan, så det svaras det som lyckat.
  if (currentEmail === newEmail) {
    return { ok: true, email: newEmail };
  }

  if (
    !verifyEmailChangeToken(
      { userId, currentEmail, newEmail, expiresAt: params.expiresAt },
      token,
    )
  ) {
    return { ok: false, reason: "lank" };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        email: newEmail,
        // Adressen är bevisad i och med att länken nåddes. Auth.js använder
        // fältet för att avgöra om en adress är verifierad, och att lämna kvar
        // den gamla tidsstämpeln vore att påstå något om fel adress.
        emailVerified: new Date(),
      },
    });
  } catch (error) {
    // Sannolikaste orsaken är att adressen hunnit tas av ett annat konto
    // under timmen som gått — det unika indexet på `User.email` är det som
    // fångar kapplöpningen, och det är meningen att den fångas i databasen och
    // inte av en kontroll som kan bli inaktuell.
    console.error(`Kunde inte byta adress för ${userId}:`, error);
    return { ok: false, reason: "tagen" };
  }

  return { ok: true, email: newEmail };
}
