/**
 * Gränsdragningen för inloggningsmejl — utan databasberoende.
 *
 * Skild från `loginRateLimit.ts` med flit. Testet avslöjade problemet: så
 * länge policyn låg i samma modul som Prisma-klienten gick den inte att köra
 * utan `DATABASE_URL`, och en regel som bara kan provas mot en riktig databas
 * blir i praktiken oprovad.
 *
 * Tak för hur många inloggningsmejl som får begäras.
 *
 * Utan tak är inloggningsformuläret två saker på en gång: ett sätt att spamma
 * en tredje part som aldrig bett om något — attackeraren skriver in någon
 * annans adress och trycker på knappen hur många gånger som helst — och ett
 * sätt att bränna mejlkvoten så att riktiga användare inte kan logga in.
 *
 * Båda blir verkliga först vid öppen registrering, vilket är varför det här
 * hör till fas 2 och inte fanns förut.
 */

/** Per adress. Fem räcker för den som stavar fel eller inte hittar mejlet. */
const MAX_PER_IDENTIFIER = 5;

/**
 * Totalt, oavsett adress. Skyddar kvoten mot den som roterar adresser för att
 * komma runt taket per adress.
 */
const MAX_GLOBAL = 100;

export const WINDOW_MS = 60 * 60 * 1000;

export type RateLimitVerdict =
  | { allowed: true }
  /**
   * Taket per adress. Anroparen ska visa **samma kvitto som vid framgång** —
   * se `describeVerdict` nedan.
   */
  | { allowed: false; reason: "per-identifier" }
  /** Taket för hela tjänsten. Ett driftläge, inte något användaren gjort. */
  | { allowed: false; reason: "global" };

export interface RateLimitDeps {
  countForIdentifier: (identifier: string, since: Date) => Promise<number>;
  countGlobal: (since: Date) => Promise<number>;
}

/**
 * Ren funktion, så att gränsdragningen går att testa utan databas. Den kan
 * inte verifieras skarpt — ett tak som slår till är per definition något man
 * inte vill utlösa i produktion.
 */
export async function evaluateLoginRateLimit(
  identifier: string,
  now: Date,
  deps: RateLimitDeps,
): Promise<RateLimitVerdict> {
  const since = new Date(now.getTime() - WINDOW_MS);

  // Globalt först: är tjänsten under attack spelar det ingen roll vilken
  // adress just den här begäran gäller.
  const global = await deps.countGlobal(since);

  if (global >= MAX_GLOBAL) {
    return { allowed: false, reason: "global" };
  }

  const forIdentifier = await deps.countForIdentifier(identifier, since);

  if (forIdentifier >= MAX_PER_IDENTIFIER) {
    return { allowed: false, reason: "per-identifier" };
  }

  return { allowed: true };
}

/**
 * Normaliseras innan den räknas, annars kringgås taket med versaler.
 */
export function normalizeIdentifier(email: string): string {
  return email.trim().toLowerCase();
}

