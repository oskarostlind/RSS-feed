import { headers } from "next/headers";
import { normalizeEmail } from "@/lib/account/emailAddress";
import { resolveAppBaseUrlFromHost } from "@/lib/appUrl";
import {
  createAuthToken,
  consumeAuthToken,
  EMAIL_VERIFICATION_TTL_MS,
  SHORT_TTL_MS,
  type AuthTokenFailure,
} from "@/lib/auth/authTokens";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/auth/authEmails";
import {
  checkPasswordStrength,
  hashPassword,
  needsRehash,
  verifyPassword,
  type PasswordProblem,
} from "@/lib/auth/password";
import {
  checkLoginRateLimit,
  pruneLoginAttempts,
  recordLoginAttempt,
} from "@/lib/auth/loginRateLimit";
import { isSignInAllowed, resolveSignupMode } from "@/lib/auth/signupPolicy";
import {
  createUserSession,
  destroyAllUserSessions,
} from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/**
 * Registrering, inloggning och lösenordsåterställning.
 *
 * Reglerna som är värda att syna står vid sin respektive funktion. Den
 * genomgående principen är att **svaret utåt inte ska avslöja om en adress har
 * ett konto**. Ett formulär som säger "adressen finns inte" är en tjänst som
 * berättar vilka av dina kollegor som är kunder hos oss, och för en tjänst vars
 * hela innehåll är vilka bolag en säljare bevakar är det inte en detalj.
 */

export type AuthFailure =
  | "format"
  | PasswordProblem
  | "olika"
  | "uppgifter"
  | "overifierad"
  | "belastning"
  | "nekad"
  | "utskick"
  | "adress"
  | AuthTokenFailure
  | "fel";

export type AuthResult =
  | { ok: true }
  | { ok: false; reason: AuthFailure };

async function resolveBaseUrl(): Promise<string | null> {
  const headerList = await headers();

  return resolveAppBaseUrlFromHost(
    headerList.get("x-forwarded-host") ?? headerList.get("host"),
    headerList.get("x-forwarded-proto"),
  );
}

async function sendTokenLink(
  userId: string,
  email: string,
  purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET",
): Promise<AuthResult> {
  const baseUrl = await resolveBaseUrl();

  if (!baseUrl) {
    console.error("Kunde inte härleda tjänstens adress — ingen länk skickad.");
    return { ok: false, reason: "adress" };
  }

  const secret = await createAuthToken({
    userId,
    purpose,
    ttlMs:
      purpose === "EMAIL_VERIFICATION" ? EMAIL_VERIFICATION_TTL_MS : SHORT_TTL_MS,
  });

  const path = purpose === "EMAIL_VERIFICATION" ? "/verifiera" : "/nytt-losenord";
  const url = new URL(path, baseUrl);
  url.searchParams.set("t", secret);

  try {
    if (purpose === "EMAIL_VERIFICATION") {
      await sendVerificationEmail(email, url.toString());
    } else {
      await sendPasswordResetEmail(email, url.toString());
    }
  } catch (error) {
    console.error(`Kunde inte skicka ${purpose}-mejl:`, error);
    return { ok: false, reason: "utskick" };
  }

  return { ok: true };
}

/**
 * Registrering med adress och lösenord.
 *
 * **En befintlig adress ger samma svar som en ny.** Annars blir formuläret ett
 * sätt att ta reda på om någon är kund här, och det räcker med att prova
 * adresser. Den som redan har ett konto får i stället ett mejl om att någon
 * försökt registrera adressen, vilket är den enda situation där beskedet
 * faktiskt hjälper — och det når bara den som äger adressen.
 *
 * Kontot skapas **overifierat**. Inloggning kräver bekräftelse, så ett konto
 * som ingen bekräftar är ett konto ingen kan använda.
 */
export async function registerWithPassword(
  rawEmail: unknown,
  rawPassword: unknown,
  rawRepeat: unknown,
): Promise<AuthResult> {
  const email = normalizeEmail(rawEmail);

  if (!email) {
    return { ok: false, reason: "format" };
  }

  const problem = checkPasswordStrength(rawPassword);

  if (problem) {
    return { ok: false, reason: problem };
  }

  if (rawPassword !== rawRepeat) {
    return { ok: false, reason: "olika" };
  }

  // Samma tak som magiska länken hade. Registrering är också ett sätt att få
  // tjänsten att skicka mejl till en adress som inte bett om något.
  const verdict = await checkLoginRateLimit(email);

  if (!verdict.allowed) {
    if (verdict.reason === "global") {
      console.error("Globalt tak nått vid registrering.");
      return { ok: false, reason: "belastning" };
    }

    // Tyst framgång, av samma skäl som i `requestMagicLinkAction`.
    console.warn("Tak per adress nått vid registrering.");
    return { ok: true };
  }

  await recordLoginAttempt(email);

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, emailVerified: true },
  });

  if (existing) {
    // Kontot finns. Har det inget lösenord — alltså skapat med magisk länk —
    // är det rimligast att erbjuda en väg in i stället för att låtsas att
    // ingenting hände. Återställningsmejlet är den vägen.
    if (!existing.passwordHash) {
      await sendTokenLink(existing.id, email, "PASSWORD_RESET");
    }

    return { ok: true };
  }

  if (resolveSignupMode() !== "open" && !isSignInAllowed(email, false)) {
    console.warn(`Registrering nekad för en adress (läge: ${resolveSignupMode()}).`);
    return { ok: false, reason: "nekad" };
  }

  let userId: string;

  try {
    const created = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(rawPassword as string) },
      select: { id: true },
    });
    userId = created.id;
  } catch (error) {
    console.error("Kunde inte skapa konto:", error);
    return { ok: false, reason: "fel" };
  }

  const sent = await sendTokenLink(userId, email, "EMAIL_VERIFICATION");
  await pruneLoginAttempts();

  return sent;
}

/**
 * Inloggning.
 *
 * **Fel adress och fel lösenord ger samma besked.** Skillnaden vore annars en
 * lista över vilka adresser som har konto.
 *
 * Lösenordet kontrolleras även när kontot saknar hash, mot en kasserad
 * jämförelse — utan det svarar servern märkbart snabbare på okända adresser,
 * och den skillnaden räcker för att kartlägga användare.
 */
export async function loginWithPassword(
  rawEmail: unknown,
  rawPassword: unknown,
): Promise<AuthResult> {
  const email = normalizeEmail(rawEmail);
  const password = typeof rawPassword === "string" ? rawPassword : "";

  if (!email || password.length === 0) {
    return { ok: false, reason: "uppgifter" };
  }

  const verdict = await checkLoginRateLimit(email);

  if (!verdict.allowed) {
    return {
      ok: false,
      reason: verdict.reason === "global" ? "belastning" : "uppgifter",
    };
  }

  await recordLoginAttempt(email);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, emailVerified: true },
  });

  // En hash att jämföra mot även när kontot inte finns. Kostnaden är densamma,
  // vilket är hela poängen — se kommentaren ovan.
  const stored =
    user?.passwordHash ??
    "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

  const matches = await verifyPassword(password, stored);

  if (!user || !user.passwordHash || !matches) {
    return { ok: false, reason: "uppgifter" };
  }

  if (!user.emailVerified) {
    return { ok: false, reason: "overifierad" };
  }

  // Enda stunden vi har lösenordet i klartext, alltså enda tillfället att
  // uppgradera en hash gjord med svagare parametrar. Ett fel här får inte
  // hindra inloggningen.
  if (needsRehash(user.passwordHash)) {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(password) },
      });
    } catch (error) {
      console.error("Kunde inte hasha om lösenordet:", error);
    }
  }

  await createUserSession(user.id);
  await pruneLoginAttempts();

  return { ok: true };
}

/**
 * Skickar ett nytt verifieringsmejl. Används av den som inte hittar det första.
 */
export async function resendVerification(rawEmail: unknown): Promise<AuthResult> {
  const email = normalizeEmail(rawEmail);

  if (!email) {
    return { ok: false, reason: "format" };
  }

  const verdict = await checkLoginRateLimit(email);

  if (!verdict.allowed) {
    return verdict.reason === "global"
      ? { ok: false, reason: "belastning" }
      : { ok: true };
  }

  await recordLoginAttempt(email);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });

  // Tyst framgång även när kontot saknas eller redan är verifierat.
  if (!user || user.emailVerified) {
    return { ok: true };
  }

  return sendTokenLink(user.id, email, "EMAIL_VERIFICATION");
}

/**
 * Löser in verifieringslänken och loggar in användaren direkt.
 *
 * Att logga in på kuppen är inte en genväg: den som når länken har bevisat
 * kontroll över adressen, vilket är precis det inloggning ska visa. Alternativet
 * — verifiera och sedan be om lösenordet igen — är ett extra steg utan
 * säkerhetsvinst.
 */
export async function completeEmailVerification(
  secret: unknown,
): Promise<AuthResult> {
  const result = await consumeAuthToken(secret, "EMAIL_VERIFICATION");

  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  try {
    await prisma.user.update({
      where: { id: result.token.userId },
      data: { emailVerified: new Date() },
    });
  } catch (error) {
    console.error("Kunde inte markera adressen som verifierad:", error);
    return { ok: false, reason: "fel" };
  }

  await createUserSession(result.token.userId);

  return { ok: true };
}

/**
 * Begär återställning. Svarar alltid som om mejlet skickats.
 */
export async function requestPasswordReset(rawEmail: unknown): Promise<AuthResult> {
  const email = normalizeEmail(rawEmail);

  if (!email) {
    return { ok: false, reason: "format" };
  }

  const verdict = await checkLoginRateLimit(email);

  if (!verdict.allowed) {
    return verdict.reason === "global"
      ? { ok: false, reason: "belastning" }
      : { ok: true };
  }

  await recordLoginAttempt(email);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    return { ok: true };
  }

  const sent = await sendTokenLink(user.id, email, "PASSWORD_RESET");
  await pruneLoginAttempts();

  return sent;
}

/**
 * Sätter ett nytt lösenord och **loggar ut alla andra sessioner**.
 *
 * Det sista är hela skälet att ha sessionerna i databasen. Den som byter
 * lösenord för att någon annan kommit åt kontot ska kasta ut inkräktaren, inte
 * bara sig själv. Med en JWT-session hade inkräktarens kaka fortsatt gälla i
 * upp till trettio dagar.
 *
 * Adressen räknas samtidigt som verifierad: mejlet med länken nådde fram, vilket
 * är samma bevis som verifieringen bygger på. Det gör återställning till vägen
 * in för konton som skapades med magisk länk och aldrig verifierades.
 */
export async function completePasswordReset(
  secret: unknown,
  rawPassword: unknown,
  rawRepeat: unknown,
): Promise<AuthResult> {
  const problem = checkPasswordStrength(rawPassword);

  if (problem) {
    return { ok: false, reason: problem };
  }

  if (rawPassword !== rawRepeat) {
    return { ok: false, reason: "olika" };
  }

  const result = await consumeAuthToken(secret, "PASSWORD_RESET");

  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  try {
    await prisma.user.update({
      where: { id: result.token.userId },
      data: {
        passwordHash: await hashPassword(rawPassword as string),
        emailVerified: new Date(),
      },
    });
  } catch (error) {
    console.error("Kunde inte spara nytt lösenord:", error);
    return { ok: false, reason: "fel" };
  }

  await destroyAllUserSessions(result.token.userId);
  await createUserSession(result.token.userId);

  return { ok: true };
}

/**
 * Beskeden användaren möter. Samlade på ett ställe så att formuleringarna går
 * att granska tillsammans — det är där man ser om någon av dem råkar avslöja
 * mer än de andra.
 */
export function describeAuthFailure(reason: AuthFailure): string {
  switch (reason) {
    case "format":
      return "Det där ser inte ut som en mejladress vi kan skicka till.";
    case "tomt":
      return "Fyll i ett lösenord.";
    case "kort":
      return "Lösenordet måste vara minst 8 tecken.";
    case "langt":
      return "Lösenordet får vara högst 200 tecken.";
    case "olika":
      return "Lösenorden stämmer inte överens.";
    case "uppgifter":
      return "Fel adress eller lösenord.";
    case "overifierad":
      return "Adressen är inte bekräftad än. Kolla mejlet vi skickade — eller begär ett nytt nedan.";
    case "belastning":
      return "Tjänsten tar emot ovanligt många förfrågningar just nu. Försök igen om en stund.";
    case "nekad":
      return "Tjänsten tar just nu inte emot nya konton.";
    case "utskick":
      return "Mejlet kunde inte skickas. Kontrollera adressen och försök igen.";
    case "adress":
      return "Tjänsten kunde inte bygga länken. Hör av dig så rättar vi det.";
    case "utgangen":
      return "Länken har gått ut. Begär en ny så skickar vi ett nytt mejl.";
    case "forbrukad":
      return "Länken är redan använd. Begär en ny om du behöver göra om det.";
    case "saknas":
      return "Länken är ofullständig. Prova att kopiera hela adressen från mejlet.";
    case "ogiltig":
      return "Länken gäller inte. Den kan ha brutits i mejlprogrammet, eller ersatts av en nyare.";
    case "fel":
      return "Något gick fel. Försök igen.";
  }
}
