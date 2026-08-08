import type { AuthTokenPurpose } from "@/generated/prisma/enums";
import {
  describeAuthTokenFailure,
  generateTokenSecret,
  hashTokenSecret,
  type AuthTokenFailure,
} from "@/lib/auth/authTokenSecret";
import { prisma } from "@/lib/prisma";

/**
 * Databasdelen av engångslänkarna. Själva hemligheten och beskeden ligger i
 * `authTokenSecret.ts`, som går att testa utan databas — se den modulen för
 * varför länkarna ser ut som de gör.
 */

export {
  describeAuthTokenFailure,
  generateTokenSecret,
  hashTokenSecret,
};
export type { AuthTokenFailure };

/** Verifieringslänken får leva ett dygn. Den som just registrerat sig läser mejlet nu. */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Återställning och adressbyte lever en timme. Kortare än verifieringen med
 * flit: båda flyttar kontrollen över ett konto, och en sådan länk ska inte
 * ligga och vänta i en inkorg.
 */
export const SHORT_TTL_MS = 60 * 60 * 1000;

export interface ConsumedAuthToken {
  userId: string;
  newEmail: string | null;
}

export type ConsumeResult =
  | { ok: true; token: ConsumedAuthToken }
  | { ok: false; reason: AuthTokenFailure };

export interface CreateAuthTokenOptions {
  userId: string;
  purpose: AuthTokenPurpose;
  /** Måladressen vid adressbyte. Utelämnas för övriga ändamål. */
  newEmail?: string;
  ttlMs?: number;
}

/**
 * Skapar en länkhemlighet och returnerar den. Värdet finns bara i det här
 * returvärdet — efter det är det bara hashen kvar, och en tappad länk går inte
 * att få tillbaka utan att begära en ny.
 *
 * Tidigare obrukade länkar för samma ändamål ogiltigförklaras. Skälet är
 * konkret: begär någon tre återställningsmejl ska bara det sista fungera,
 * annars räcker det att komma över det äldsta.
 */
export async function createAuthToken(
  options: CreateAuthTokenOptions,
): Promise<string> {
  const secret = generateTokenSecret();
  const ttl = options.ttlMs ?? SHORT_TTL_MS;

  await prisma.authToken.updateMany({
    where: {
      userId: options.userId,
      purpose: options.purpose,
      consumedAt: null,
    },
    data: { consumedAt: new Date() },
  });

  await prisma.authToken.create({
    data: {
      tokenHash: hashTokenSecret(secret),
      userId: options.userId,
      purpose: options.purpose,
      newEmail: options.newEmail ?? null,
      expiresAt: new Date(Date.now() + ttl),
    },
  });

  return secret;
}

/**
 * Löser in en länk och markerar den som förbrukad i samma andetag.
 *
 * **Förbrukningen sker med ett villkorat `updateMany` och inte med en läsning
 * följd av en skrivning.** Två klick som kommer samtidigt — vilket händer på
 * riktigt när en mejlklient förhämtar länken och användaren klickar — skulle
 * annars båda hitta en obrukad token och båda lyckas. Här vinner exakt en,
 * eftersom databasen räknar hur många rader villkoret träffade.
 *
 * Ändamålet ingår i villkoret. En återställningslänk får inte gå att lösa in på
 * verifieringssidan, ens om någon byter ut sökvägen.
 */
export async function consumeAuthToken(
  secret: unknown,
  purpose: AuthTokenPurpose,
): Promise<ConsumeResult> {
  if (typeof secret !== "string" || secret.length === 0) {
    return { ok: false, reason: "saknas" };
  }

  const tokenHash = hashTokenSecret(secret);

  const existing = await prisma.authToken.findUnique({
    where: { tokenHash },
    select: {
      userId: true,
      newEmail: true,
      purpose: true,
      expiresAt: true,
      consumedAt: true,
    },
  });

  if (!existing || existing.purpose !== purpose) {
    return { ok: false, reason: "ogiltig" };
  }

  if (existing.consumedAt) {
    return { ok: false, reason: "forbrukad" };
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "utgangen" };
  }

  const claimed = await prisma.authToken.updateMany({
    where: { tokenHash, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  // Noll rader betyder att någon annan hann först mellan läsningen och
  // skrivningen ovan. Det är kapplöpningen kommentaren beskriver, och den
  // förloraren ska få samma besked som vid en redan använd länk.
  if (claimed.count === 0) {
    return { ok: false, reason: "forbrukad" };
  }

  return {
    ok: true,
    token: { userId: existing.userId, newEmail: existing.newEmail },
  };
}

