/**
 * Tidsbudget och parallellitet för morgonkörningen.
 *
 * Vercel Hobby ger funktionen 60 sekunder. Med ~350 ms per bolag för
 * nyhetskällorna, plus JobTech-anropet, räcker en sekventiell loop till
 * uppskattningsvis 30–50 bolag innan körningen dödas mitt i. Det är inte ett
 * teoretiskt tak: en avbruten körning skickar inget mejl alls, och bolagen
 * sist i listan blir aldrig sökta.
 *
 * Två åtgärder, i den ordning de betyder något:
 *
 * 1. **Parallellitet.** Bolagen är oberoende av varandra — arbetet är väntan
 *    på nätverk, inte processorarbete. Att köra dem i grupper i stället för en
 *    i taget är den enskilt största vinsten och kostar ingenting.
 *
 * 2. **Budget och markör.** Även parallellt tar arbetet slut på tid någon
 *    gång. Då ska körningen sluta *frivilligt* med ett komplett svar och ett
 *    mejl för det den hann med, i stället för att dödas mitt i. Nästa körning
 *    fortsätter där den slutade, eftersom bolagen hämtas äldst kontrollerad
 *    först.
 *
 * Det här är avsiktligt en enklare lösning än fan-out till parallella
 * funktioner. Fan-out höjer taket ytterligare men kräver att tjänsten anropar
 * sig själv över nätverket — en ny felkälla och en ny säkerhetsyta. Den vägen
 * står öppen när det här taket faktiskt nås.
 */

const DEFAULT_CONCURRENCY = 5;

/**
 * 45 av 60 sekunder. Marginalen ska rymma det som händer *efter* att sista
 * bolaget bearbetats: mejlutskicket, som är ett nätverksanrop per mottagare.
 */
const DEFAULT_BUDGET_MS = 45_000;

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  max: number,
): number {
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
}

/**
 * Hur många bolag som bearbetas samtidigt. Taket på 20 är inte godtyckligt:
 * varje bolag öppnar fem utgående anrop (två RSS-frågor per leverantör, GNews,
 * JobTech), så 20 samtidiga bolag är redan hundra öppna anslutningar. Högre än
 * så börjar källorna svara med strypning i stället för träffar.
 */
export function resolveConcurrency(
  raw: string | undefined = process.env.DISCOVERY_CONCURRENCY,
): number {
  return parsePositiveInt(raw, DEFAULT_CONCURRENCY, 20);
}

export function resolveBudgetMs(
  raw: string | undefined = process.env.DISCOVERY_BUDGET_MS,
): number {
  return parsePositiveInt(raw, DEFAULT_BUDGET_MS, 300_000);
}

export interface Deadline {
  /** Sant så länge det finns tid kvar att starta ännu en grupp. */
  hasTimeLeft: () => boolean;
  elapsedMs: () => number;
}

export function startDeadline(budgetMs: number = resolveBudgetMs()): Deadline {
  const startedAt = Date.now();

  return {
    hasTimeLeft: () => Date.now() - startedAt < budgetMs,
    elapsedMs: () => Date.now() - startedAt,
  };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }

  return groups;
}
