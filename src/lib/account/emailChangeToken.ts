import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Bekräftelselänken för byte av mejladress.
 *
 * **Varför bytet måste bekräftas från den nya adressen.** Inloggningen sker med
 * magisk länk, alltså är mejladressen kontots enda nyckel. Ett byte som slår
 * igenom direkt gör en felstavning permanent: användaren loggas inte ut, men
 * nästa gång sessionen går ut finns ingen väg tillbaka in, och supporten är det
 * enda som återstår. Länken skickas därför till den **nya** adressen och bytet
 * sker först när någon klickat på den — då är det bevisat att adressen finns
 * och att användaren når den.
 *
 * **Varför härledd signatur och inte en rad i databasen.** Samma skäl som för
 * avregistreringen i `email/unsubscribeToken.ts`: en sparad token kräver en
 * tabell, en migration och en städrutin för övergivna förfrågningar. Den
 * härledda kräver ingenting av det.
 *
 * **Signaturen är engångs utan att vi håller reda på det.** Den räknas över
 * användarens *nuvarande* adress. I samma stund bytet gått igenom stämmer inte
 * längre den delen, och länken slutar verifiera av sig själv. Det löser det
 * som annars kräver en förbrukningsflagga: en gammal länk kan inte användas för
 * att rulla tillbaka ett senare byte.
 *
 * Signaturen ger **inte** inloggning. Det enda den öppnar är att flytta kontot
 * till den adress som redan står i länken, och som mejlet skickades till.
 */

/** 32 hextecken = 128 bitar. Räcker mot gissning och håller URL:en kort. */
const TOKEN_LENGTH = 32;

/**
 * En timme. Kort därför att den som just skrivit in en ny adress läser mejlet
 * med en gång — och en länk som byter inloggningsadress ska inte ligga och
 * vänta i en inkorg i en vecka.
 */
export const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;

export interface EmailChangeClaim {
  userId: string;
  /** Adressen kontot har *nu*. Det som gör signaturen engångs. */
  currentEmail: string;
  /** Adressen kontot ska flyttas till. */
  newEmail: string;
  /** Millisekunder sedan epok. Ligger i länken och är därmed signerad. */
  expiresAt: number;
}

function resolveSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.AUTH_SECRET?.trim() || null;
}

/**
 * Null när `AUTH_SECRET` saknas. Anroparen ska då avbryta bytet i stället för
 * att skicka ett mejl med en länk som inte fungerar — ett halvt genomfört
 * adressbyte är värre än ett som aldrig startade.
 */
export function createEmailChangeToken(
  claim: EmailChangeClaim,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const secret = resolveSecret(env);

  if (!secret) {
    return null;
  }

  // Fälten separeras med ett tecken som inte kan förekomma i en mejladress, så
  // att två olika anspråk aldrig kan ge samma sträng att signera.
  const message = [
    "email-change",
    claim.userId,
    claim.currentEmail,
    claim.newEmail,
    String(claim.expiresAt),
  ].join("\n");

  return createHmac("sha256", secret)
    .update(message)
    .digest("hex")
    .slice(0, TOKEN_LENGTH);
}

/**
 * Jämförelsen är konstanttid, av samma skäl som för avregistreringen: en vanlig
 * `===` läcker hur många tecken som stämde genom hur lång tid den tog.
 */
export function verifyEmailChangeToken(
  claim: EmailChangeClaim,
  token: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = createEmailChangeToken(claim, env);

  if (!expected || !token) {
    return false;
  }

  const given = Buffer.from(token, "utf8");
  const want = Buffer.from(expected, "utf8");

  if (given.length !== want.length) {
    return false;
  }

  return timingSafeEqual(given, want);
}

export function isEmailChangeExpired(
  expiresAt: number,
  now: number = Date.now(),
): boolean {
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

/**
 * Läser utgångstiden ur länken. Egen funktion därför att den kommer in som en
 * sträng från en URL och en `NaN` här skulle annars tolkas som "utgången för
 * länge sedan" på ett ställe och "giltig för alltid" på ett annat.
 */
export function parseExpiresAt(raw: unknown): number | null {
  if (typeof raw !== "string") {
    return null;
  }

  const parsed = Number(raw);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Adressen bekräftelsemejlet ska peka på. Null när hemligheten eller tjänstens
 * publika adress saknas — se `createEmailChangeToken` för varför halva vägen
 * inte är ett alternativ.
 */
export function buildEmailChangeUrl(
  claim: EmailChangeClaim,
  baseUrl: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const token = createEmailChangeToken(claim, env);

  if (!token || !baseUrl) {
    return null;
  }

  // Utanför `/dashboard` med flit: den layouten omdirigerar utloggade till
  // inloggningen, och bekräftelsen ska gå att slutföra i telefonens
  // mejlprogram utan att först begära en magisk länk.
  const url = new URL("/byt-mejl", baseUrl);
  url.searchParams.set("u", claim.userId);
  url.searchParams.set("e", claim.newEmail);
  url.searchParams.set("x", String(claim.expiresAt));
  url.searchParams.set("t", token);

  return url.toString();
}
