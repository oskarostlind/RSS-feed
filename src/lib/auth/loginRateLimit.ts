import { prisma } from "@/lib/prisma";
import {
  evaluateLoginRateLimit,
  type RateLimitVerdict,
  WINDOW_MS,
} from "@/lib/auth/loginRateLimitPolicy";

export {
  normalizeIdentifier,
  type RateLimitVerdict,
} from "@/lib/auth/loginRateLimitPolicy";

/**
 * Databaskopplingen till policyn i `loginRateLimitPolicy.ts`. Här finns inga
 * regler, bara räkningarna som reglerna behöver.
 */

export async function recordLoginAttempt(identifier: string): Promise<void> {
  try {
    await prisma.loginAttempt.create({ data: { identifier } });
  } catch (error) {
    // Ett misslyckat skrivförsök får inte hindra inloggningen. Konsekvensen
    // är ett oräknat försök, vilket är mindre illa än en låst dörr.
    console.error("Kunde inte registrera inloggningsförsök:", error);
  }
}

/**
 * Rader äldre än fönstret fyller ingen funktion. Städas opportunistiskt i
 * stället för med ett eget schemalagt jobb: tabellen växer långsamt, och ett
 * cron-jobb till är en sak till som kan gå sönder tyst.
 */
export async function pruneLoginAttempts(now: Date = new Date()): Promise<void> {
  try {
    await prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - WINDOW_MS) } },
    });
  } catch (error) {
    console.error("Kunde inte städa inloggningsförsök:", error);
  }
}

export async function checkLoginRateLimit(
  identifier: string,
  now: Date = new Date(),
): Promise<RateLimitVerdict> {
  return evaluateLoginRateLimit(identifier, now, {
    countForIdentifier: (id, since) =>
      prisma.loginAttempt.count({
        where: { identifier: id, createdAt: { gte: since } },
      }),
    countGlobal: (since) =>
      prisma.loginAttempt.count({ where: { createdAt: { gte: since } } }),
  });
}
