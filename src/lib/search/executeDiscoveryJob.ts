import type { MorningSummaryNewsItem } from "@/lib/email/EmailService";
import { JobTechService } from "@/lib/jobs/JobTechService";
import type { MorningSummaryJobAd } from "@/lib/jobs/runCompanyJobSearch";
import { prisma } from "@/lib/prisma";
import {
  chunk,
  resolveBudgetMs,
  resolveConcurrency,
  startDeadline,
} from "@/lib/search/discoveryBudget";
import { resolveWindowDays } from "@/lib/search/recency";
import {
  assessSourceHealth,
  tallyCompanyOutcome,
  type SourceHealthReport,
  type SourceLabel,
  type SourceTally,
} from "@/lib/search/sourceHealth";
import { RssFeedService } from "@/lib/search/RssFeedService";
import { SearchService } from "@/lib/search/SearchService";
import {
  runCompanyDiscovery,
  type CompanyDiscoveryResult,
} from "@/lib/search/runCompanyDiscovery";

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
   * Bolag som fanns i portföljen men som tidsbudgeten inte räckte till.
   * Noll är det normala; ett tal över noll betyder att portföljen vuxit förbi
   * vad en enskild körning hinner med, och att kön behöver höjas eller delas.
   */
  companiesSkippedForTime: number;
  /** Hur lång tid sökningen tog, exklusive mejlutskick. */
  discoveryDurationMs: number;
  concurrency: number;
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
 * Seed- och testkonton har adresser som inte går att leverera till. Ett
 * misslyckat Resend-anrop ska inte se ut som ett fel i morgonkörningen.
 */
function isDeliverableEmail(email: string): boolean {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return false;
  }

  const domain = email.split("@")[1]?.toLowerCase() ?? "";

  return !["localhost", "example.com", "test", "invalid"].includes(domain);
}

/**
 * JobTech-anropet är ett extra utgående anrop per bolag, alltså direkt
 * tidskostnad i en körning som redan har 60 sekunder att röra sig på. Nödbroms
 * via `JOBTECH_ENABLED=false` så att källan går att stänga av utan att deploya
 * om, ifall den skulle visa sig sänka morgonkörningen.
 */
function isJobTechEnabled(): boolean {
  return process.env.JOBTECH_ENABLED?.toLowerCase() !== "false";
}

/**
 * GNews är avstängd som standard — enda källan som måste slås **på**.
 *
 * Mätning 2026-08-07 över åtta bolag (`/api/debug/source-coverage`): på de fem
 * lokala och medelstora svenska bolagen gav GNews noll träffar rakt igenom. På
 * de tre riksmediebolagen gav den 24 träffar, men bara **två** av dem var
 * sådana som ingen annan källa hittade och som dessutom nådde tidsfönstret.
 *
 * Två mejlbara artiklar på åtta bolag, båda på bolag av en typ tjänsten inte är
 * byggd för, väger inte upp kostnaden: ett utgående anrop per bolag varje
 * morgon, och den enda källan som kan slå i en kvot. Strypningen är dessutom
 * hårdare än vi trott — 429 kom vid ungefär ett anrop i sekunden, alltså långt
 * under vad `DISCOVERY_CONCURRENCY` redan tillåter.
 *
 * Avstängd, inte borttagen. `GNEWS_ENABLED=true` sätter tillbaka den utan
 * deploy, och mätverktyget finns kvar för att ompröva beslutet.
 */
function isGNewsEnabled(): boolean {
  return process.env.GNEWS_ENABLED?.toLowerCase() === "true";
}

/**
 * Flyttar fram markören för de bolag som just bearbetats.
 *
 * Ett misslyckande här får inte sänka körningen — artiklarna är redan sparade
 * och mejlet är fortfarande värt att skicka. Konsekvensen av att markören inte
 * flyttas är att bolaget söks om nästa körning, vilket dedupliceringen ändå
 * fångar upp.
 */
async function markCompaniesChecked(companyIds: string[]): Promise<void> {
  if (companyIds.length === 0) {
    return;
  }

  try {
    await prisma.company.updateMany({
      where: { id: { in: companyIds } },
      data: { lastCheckedAt: new Date() },
    });
  } catch (error) {
    console.error("Failed to update lastCheckedAt for companies:", error);
  }
}

export async function executeDiscoveryJob(
  companyId?: string,
): Promise<DiscoveryJobResult> {
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

  const searchService = isGNewsEnabled() ? SearchService.fromEnv() : null;
  const rssFeedService = new RssFeedService();
  const jobTechService = isJobTechEnabled() ? new JobTechService() : null;

  const concurrency = resolveConcurrency();
  const deadline = startDeadline(resolveBudgetMs());

  const byUser = new Map<string, UserDiscoveryResult>();
  const sourceTotals = new Map<SourceLabel, SourceTally>();
  let processed = 0;

  for (const group of chunk(companies, concurrency)) {
    // Budgeten kontrolleras mellan grupper, inte inuti dem. En påbörjad grupp
    // körs alltid färdigt — att avbryta mitt i skulle lämna halva gruppen utan
    // uppdaterad markör och därmed söka om den nästa körning.
    if (!deadline.hasTimeLeft()) {
      break;
    }

    const groupResults = await Promise.all(
      group.map((company) =>
        runCompanyDiscovery(
          company.id,
          company.name,
          searchService,
          rssFeedService,
          jobTechService,
        ),
      ),
    );

    group.forEach((company, index) => {
      const result = groupResults[index];
      let entry = byUser.get(company.userId);

      if (!entry) {
        entry = {
          userId: company.userId,
          email: company.user.email,
          emailDeliverable: isDeliverableEmail(company.user.email),
          morningEmailOptedOut: company.user.morningEmailOptOutAt !== null,
          results: [],
          createdNewsItems: [],
          possibleNewsItems: [],
          createdJobAds: [],
        };
        byUser.set(company.userId, entry);
      }

      entry.results.push(result);
      entry.createdNewsItems.push(...result.createdItems);
      entry.possibleNewsItems.push(...result.createdPossibleItems);
      entry.createdJobAds.push(...result.jobs.createdItems);

      for (const outcome of result.perSource) {
        tallyCompanyOutcome(sourceTotals, outcome.source, outcome);
      }
    });

    processed += group.length;
    await markCompaniesChecked(group.map((company) => company.id));
  }

  const perUser = [...byUser.values()];
  const results = perUser.flatMap((entry) => entry.results);

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
    companiesSkippedForTime: companies.length - processed,
    discoveryDurationMs: deadline.elapsedMs(),
    concurrency,
    sourceHealth: assessSourceHealth([...sourceTotals.values()]),
    perUser,
    results,
    createdNewsItems: perUser.flatMap((entry) => entry.createdNewsItems),
  };
}
