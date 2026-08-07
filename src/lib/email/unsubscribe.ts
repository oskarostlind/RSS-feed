import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribeToken";

/**
 * Själva avregistreringen, delad mellan bekräftelsesidan och enklicks-POSTen.
 *
 * Ligger utanför båda därför att de har olika krav på svaret — sidan vill visa
 * något för en människa, RFC 8058-vägen vill ha en tom 200 — men exakt samma
 * krav på behörighet. Två kopior av behörighetskontrollen är en kopia för
 * mycket.
 */

export type UnsubscribeOutcome =
  | { ok: true; email: string; alreadyDone: boolean }
  | { ok: false; reason: "invalid-token" | "unknown-user" | "failed" };

export async function unsubscribeFromMorningEmail(
  userId: string | null | undefined,
  token: string | null | undefined,
): Promise<UnsubscribeOutcome> {
  if (!userId || !verifyUnsubscribeToken(userId, token)) {
    return { ok: false, reason: "invalid-token" };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, morningEmailOptOutAt: true },
    });

    if (!user) {
      return { ok: false, reason: "unknown-user" };
    }

    // Redan avregistrerad räknas som framgång, inte som fel. Mejlklienter
    // förhämtar länkar och användare klickar två gånger; båda ska mötas av
    // samma lugna besked och inte av att tidsstämpeln skrivs om.
    if (user.morningEmailOptOutAt) {
      return { ok: true, email: user.email, alreadyDone: true };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { morningEmailOptOutAt: new Date() },
    });

    return { ok: true, email: user.email, alreadyDone: false };
  } catch (error) {
    console.error(`Avregistrering misslyckades för ${userId}:`, error);
    return { ok: false, reason: "failed" };
  }
}
