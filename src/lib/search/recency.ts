/**
 * Tidsfönster för morgonmejlet.
 *
 * Sökmotorernas flöden är inte kronologiska — en fråga på ett bolagsnamn ger
 * lika gärna en artikel från 2014 som en från igår. Mätning 2026-08-07 på
 * "Peges i Ljusdal AB" gav tolv relevanta träffar, varav en från 2014 och en
 * från maj 2025. Utan fönster hamnar de i mejlet första gången de upptäcks,
 * och en AM som får en elva år gammal notis slutar öppna mejlet.
 *
 * Fönstret gäller **bara vad som mejlas**. Allt sparas fortfarande i
 * databasen: dels för att dashboardens historik är värdefull i sig, dels för
 * att dedupliceringen bygger på att en artikel finns lagrad. Filtrerade vi
 * bort artikeln före sparandet skulle den upptäckas på nytt varje morgon och
 * filtreras bort på nytt, i all evighet.
 */

const DEFAULT_WINDOW_DAYS = 7;
const MS_PER_DAY = 86_400_000;

/**
 * Sju dagar, inte ett. Cron-jobbet kan ha uteblivit — Vercel Hobby ger inga
 * garantier — och publicister backdaterar. Enligt målbildens avvägning väger
 * en missad nyhet tyngre än en dagsgammal, så fönstret är generöst satt.
 */
export function resolveWindowDays(
  raw: string | undefined = process.env.NEWS_WINDOW_DAYS,
): number {
  const parsed = Number(raw);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WINDOW_DAYS;
}

export interface DatedItem {
  publishedAt: Date | null;
}

/**
 * Artiklar utan publiceringsdatum släpps igenom.
 *
 * Ett saknat datum betyder att källan inte angav något, inte att artikeln är
 * gammal. Att tysta dem vore att välja precision framför täckning, vilket är
 * fel väg enligt målbildens avsnitt 4.
 */
export function isWithinWindow(
  item: DatedItem,
  now: Date,
  windowDays: number,
): boolean {
  if (!item.publishedAt) {
    return true;
  }

  const ageMs = now.getTime() - item.publishedAt.getTime();

  // Negativ ålder = framtida datum. Förekommer när en publicist sätter fel
  // tidszon; det är inte skäl att undanhålla artikeln.
  return ageMs <= windowDays * MS_PER_DAY;
}

export interface RecencySplit<T> {
  /** Inom fönstret — får mejlas. */
  fresh: T[];
  /** Utanför fönstret — sparas men mejlas inte. */
  archived: T[];
}

export function splitByRecency<T extends DatedItem>(
  items: T[],
  now: Date = new Date(),
  windowDays: number = resolveWindowDays(),
): RecencySplit<T> {
  const fresh: T[] = [];
  const archived: T[] = [];

  for (const item of items) {
    if (isWithinWindow(item, now, windowDays)) {
      fresh.push(item);
    } else {
      archived.push(item);
    }
  }

  return { fresh, archived };
}
