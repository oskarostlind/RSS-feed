import type { MorningSummaryNewsItem } from "@/lib/email/EmailService";
import type { MorningSummaryJobAd } from "@/lib/jobs/runCompanyJobSearch";
import { prisma } from "@/lib/prisma";
import { resolveShardCount, splitIntoShards } from "@/lib/search/discoveryShards";
import { resolveWindowDays } from "@/lib/search/recency";
import {
  assessSourceHealth,
  type SourceHealthReport,
  type SourceLabel,
  type SourceTally,
} from "@/lib/search/sourceHealth";
import {
  runDiscoveryForCompanies,
  type DiscoverableCompany,
  type ShardDiscoveryResult,
  type ShardUserResult,
} from "@/lib/search/runDiscoveryShard";
import { callDiscoveryShard } from "@/lib/search/shardClient";
import type { CompanyDiscoveryResult } from "@/lib/search/runCompanyDiscovery";

/** Resultatet för en enskild användare — en mottagare, ett mejl. */
export interface UserDiscoveryResult {
  userId: string;
  email: string;
  /** Falskt för t.ex. seed-kontot mvp-dev@localhost, som inte ska mejlas. */
  emailDeliverable: boolean;
  /**
   * Sant när användaren avregistrerat sig. Sökningen körs ändå — nyheterna ska
   * fortsätta samlas för dashboarden, det är bara utskicket som upphör.
   */
  morningEmailOptedOut: boolean;
  results: CompanyDiscoveryResult[];
  createdNewsItems: MorningSummaryNewsItem[];
  possibleNewsItems: MorningSummaryNewsItem[];
  createdJobAds: MorningSummaryJobAd[];
}

export interface DiscoveryJobResult {
  companiesProcessed: number;
  usersProcessed: number;
  /** Tidsfönstret som gällde för körningen, i dagar. Rapporteras för spårbarhet. */
  windowDays: number;
  /** Nya artiklar som sparades men var för gamla för att mejlas. */
  archivedNewsItems: number;
  /** Nya jobbannonser inom fönstret, summerat över alla bolag. */
  createdJobAdCount: number;
  /**
   * Bolag som fanns i portföljen men som inte söktes igenom. Noll är det
   * normala. Ett tal över noll betyder antingen att tidsbudgeten tog slut
   * eller att en delkörning inte gick att nå — se `shardsFailed`.
   */
  companiesSkippedForTime: number;
  /** Hur lång tid sökningen tog, exklusive mejlutskick. */
  discoveryDurationMs: number;
  concurrency: number;
  /** Hur många delar körningen delades i. 1 = ingen fan-out, allt i den här funktionen. */
  shards: number;
  /**
   * Delar som inte svarade. Över noll betyder att bolag hoppades över av ett
   * nätverksfel och inte av tidsbrist — de kommer först i nästa körning,
   * eftersom deras markör inte flyttades.
   */
  shardsFailed: number;
  /**
   * Källornas tillstånd, härlett ur den här körningen. `silent` är det som ska
   * väcka någon: en källa som svarar utan fel men inget säger.
   */
  sourceHealth: SourceHealthReport;
  perUser: UserDiscoveryResult[];
  results: CompanyDiscoveryResult[];
  createdNewsItems: MorningSummaryNewsItem[];
}

/**
 * Slår ihop delarnas räkningar per källa.
 *
 * Måste vara en summering och inte ett val: hälsobedömningen frågar "gav den
 * här källan noll träffar på *alla* bolag", och med delade körningar ser ingen
 * enskild del alla bolag. Skulle bara en dels siffror användas skulle en källa
 * som var tyst i just den delen larma som nere fast den levererat i de andra.
 */
function mergeSourceTallies(tallies: SourceTally[]): SourceTally[] {
  const merged = new Map<SourceLabel, SourceTally>();

  for (const tally of tallies) {
    const current = merged.get(tally.source);

    if (!current) {
      merged.set(tally.source, { ...tally });
      continue;
    }

    current.companiesQueried += tally.companiesQueried;
    current.companiesWithHits += tally.companiesWithHits;
    current.totalHits += tally.totalHits;
    current.failures += tally.failures;
    current.throttled += tally.throttled;
  }

  return [...merged.values()];
}

/**
 * Bygger mottagarlistan ur delarnas resultat.
 *
 * En användares bolag kan ha hamnat i olika delar, så samma användare dyker
 * upp i flera delsvar. Att inte slå ihop dem hade betytt flera morgonmejl till
 * samma adress samma morgon — var och en med sin del av nyheterna.
 */
function mergeUsers(shards: ShardDiscoveryResult[]): UserDiscoveryResult[] {
  const byUser = new Map<string, UserDiscoveryResult>();

  for (const shard of shards) {
    for (const user of shard.perUser) {
      let entry = byUser.get(user.userId);

      if (!entry) {
        entry = createEmptyUser(user);
        byUser.set(user.userId, entry);
      }

      for (const result of user.results) {
        entry.results.push(result);
        entry.createdNewsItems.push(...result.createdItems);
        entry.possibleNewsItems.push(...result.createdPossibleItems);
        entry.createdJobAds.push(...result.jobs.createdItems);
      }
    }
  }

  return [...byUser.values()];
}

function createEmptyUser(user: ShardUserResult): UserDiscoveryResult {
  return {
    userId: user.userId,
    email: user.email,
    emailDeliverable: user.emailDeliverable,
    morningEmailOptedOut: user.morningEmailOptedOut,
    results: [],
    createdNewsItems: [],
    possibleNewsItems: [],
    createdJobAds: [],
  };
}

/**
 * Kör delarna parallellt mot tjänstens egen delrutt.
 *
 * Parallellt och inte i följd — poängen med fan-out är att varje del får sina
 * egna 60 sekunder *samtidigt*. I följd hade de delat på samordnarens 60 och
 * taket varit oförändrat.
 */
async function runShardedDiscovery(
  companies: DiscoverableCompany[],
  shardCount: number,
  baseUrl: string,
  secret: string,
): Promise<{ shards: ShardDiscoveryResult[]; failed: number }> {
  const groups = splitIntoShards(companies, shardCount);

  const settled = await Promise.all(
    groups.map((group) =>
      callDiscoveryShard(
        baseUrl,
        group.map((company) => company.id),
        secret,
      ),
    ),
  );

  const shards = settled.filter(
    (result): result is ShardDiscoveryResult => result !== null,
  );

  return { shards, failed: settled.length - shards.length };
}

export interface DiscoveryJobOptions {
  /** Söker bara ett bolag. Används av den manuella sökningen i gränssnittet. */
  companyId?: string;
  /**
   * Antal delar, om anroparen vill gå förbi `DISCOVERY_SHARDS`. Finns för att
   * fan-out ska gå att *mäta* i produktion innan miljövariabeln sätts — en
   * arkitekturändring i morgonjobbet som aldrig körts skarpt är inte byggd,
   * bara skriven.
   */
  shards?: number;
  /** Tjänstens egen adress. Krävs bara när körningen delas. */
  baseUrl?: string | null;
}

export async function executeDiscoveryJob(
  options: DiscoveryJobOptions = {},
): Promise<DiscoveryJobResult> {
  const { companyId } = options;

  const companies = companyId
    ? await prisma.company.findMany({
        where: { id: companyId },
        include: {
          user: { select: { id: true, email: true, morningEmailOptOutAt: true } },
        },
      })
    : await prisma.company.findMany({
        include: {
          user: { select: { id: true, email: true, morningEmailOptOutAt: true } },
        },
        // Äldst kontrollerad först, aldrig kontrollerad allra först. Det är
        // det som gör tidsbudgeten rättvis: hinner körningen bara halva
        // portföljen tar nästa körning den andra halvan, i stället för att
        // samma bolag söks om och om medan resten aldrig kommer till.
        orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }],
      });

  if (companyId && companies.length === 0) {
    throw new Error("COMPANY_NOT_FOUND");
  }

  if (companies.length === 0) {
    throw new Error("NO_COMPANIES");
  }

  const startedAt = Date.now();
  const secret = process.env.CRON_SECRET;
  const requestedShards = options.shards ?? resolveShardCount();

  // Tre villkor måste hålla för att dela körningen, och alla tre faller
  // tillbaka på att köra allt här. Det är den säkra riktningen: en körning i
  // en funktion är långsammare men aldrig trasig, medan en halv fan-out — utan
  // adress att anropa eller utan hemlighet att skydda rutten med — vore anrop
  // som misslyckas och bolag som tyst hoppas över.
  //
  // Enskilda bolag delas aldrig. Den manuella sökningen i gränssnittet gäller
  // ett bolag och skulle bara betala ett nätverkshopp för ingenting.
  const shardCount =
    !companyId && requestedShards > 1 && options.baseUrl && secret
      ? requestedShards
      : 1;

  let shardResults: ShardDiscoveryResult[];
  let shardsFailed = 0;

  if (shardCount > 1) {
    const outcome = await runShardedDiscovery(
      companies,
      shardCount,
      options.baseUrl as string,
      secret as string,
    );
    shardResults = outcome.shards;
    shardsFailed = outcome.failed;
  } else {
    shardResults = [await runDiscoveryForCompanies(companies)];
  }

  const perUser = mergeUsers(shardResults);
  const results = perUser.flatMap((entry) => entry.results);
  const processed = shardResults.reduce(
    (sum, shard) => sum + shard.processed,
    0,
  );

  return {
    companiesProcessed: processed,
    usersProcessed: perUser.length,
    windowDays: resolveWindowDays(),
    archivedNewsItems: results.reduce(
      (sum, result) => sum + result.archived,
      0,
    ),
    createdJobAdCount: perUser.reduce(
      (sum, entry) => sum + entry.createdJobAds.length,
      0,
    ),
    // Räknas mot portföljen och inte mot delarnas egna summor: en del som
    // aldrig svarade rapporterar ingenting alls, och dess bolag skulle då
    // försvinna ur räkningen i stället för att synas som överhoppade.
    companiesSkippedForTime: companies.length - processed,
    discoveryDurationMs: Date.now() - startedAt,
    concurrency: shardResults[0]?.concurrency ?? 0,
    shards: shardCount,
    shardsFailed,
    sourceHealth: assessSourceHealth(
      mergeSourceTallies(shardResults.flatMap((shard) => shard.sourceTallies)),
    ),
    perUser,
    results,
    createdNewsItems: perUser.flatMap((entry) => entry.createdNewsItems),
  };
}
