import { JobTechService } from "@/lib/jobs/JobTechService";
import { prisma } from "@/lib/prisma";
import {
  chunk,
  resolveBudgetMs,
  resolveConcurrency,
  startDeadline,
} from "@/lib/search/discoveryBudget";
import {
  tallyCompanyOutcome,
  type SourceLabel,
  type SourceTally,
} from "@/lib/search/sourceHealth";
import { RssFeedService } from "@/lib/search/RssFeedService";
import { SearchService } from "@/lib/search/SearchService";
import {
  runCompanyDiscovery,
  type CompanyDiscoveryResult,
} from "@/lib/search/runCompanyDiscovery";

/**
 * Själva sökarbetet för en uppsättning bolag.
 *
 * Bruten ut ur `executeDiscoveryJob` när fan-out byggdes, därför att exakt
 * samma arbete nu görs på två ställen: i morgonjobbets egen funktion när
 * körningen inte delas, och i delfunktionen när den delas. Två kopior hade
 * betytt att en rättning kan göras på det ena stället och glömmas på det
 * andra — och den sortens glapp märks först när en morgon blir tunn.
 *
 * Modulen känner inte till delar, samordnare eller mejl. Den får en lista
 * bolag och söker igenom så många den hinner.
 */

/**
 * Resultatet för en användare, som det ser ut *inuti* en del.
 *
 * Bara identiteten och bolagsresultaten. De flata listorna med artiklar som
 * mejlet behöver byggs av samordnaren, som är den enda som ser alla delar —
 * att skicka dem härifrån vore att skicka samma artiklar två gånger över
 * nätverket, en gång i `results` och en gång i sammanslagningen.
 */
export interface ShardUserResult {
  userId: string;
  email: string;
  emailDeliverable: boolean;
  morningEmailOptedOut: boolean;
  results: CompanyDiscoveryResult[];
}

export interface ShardDiscoveryResult {
  /** Bolag som faktiskt hann sökas igenom. */
  processed: number;
  /** Bolag som delen fick men inte hann med. */
  skippedForTime: number;
  durationMs: number;
  concurrency: number;
  perUser: ShardUserResult[];
  sourceTallies: SourceTally[];
}

/**
 * Seed- och testkonton har adresser som inte går att leverera till. Ett
 * misslyckat utskick ska inte se ut som ett fel i morgonkörningen.
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
 * morgon, och den enda källan som kan slå i en kvot.
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

export interface DiscoverableCompany {
  id: string;
  name: string;
  userId: string;
  user: { email: string; morningEmailOptOutAt: Date | null };
}

/**
 * Söker igenom bolagen inom tidsbudgeten och returnerar vad som hittades.
 *
 * Budgeten kontrolleras mellan grupper, inte inuti dem: en påbörjad grupp körs
 * alltid färdigt, eftersom ett avbrott mitt i skulle lämna halva gruppen utan
 * uppdaterad markör och därmed söka om den nästa körning.
 */
export async function runDiscoveryForCompanies(
  companies: readonly DiscoverableCompany[],
): Promise<ShardDiscoveryResult> {
  const searchService = isGNewsEnabled() ? SearchService.fromEnv() : null;
  const rssFeedService = new RssFeedService();
  const jobTechService = isJobTechEnabled() ? new JobTechService() : null;

  const concurrency = resolveConcurrency();
  const deadline = startDeadline(resolveBudgetMs());

  const byUser = new Map<string, ShardUserResult>();
  const sourceTotals = new Map<SourceLabel, SourceTally>();
  let processed = 0;

  for (const group of chunk(companies, concurrency)) {
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
        };
        byUser.set(company.userId, entry);
      }

      entry.results.push(result);

      for (const outcome of result.perSource) {
        tallyCompanyOutcome(sourceTotals, outcome.source, outcome);
      }
    });

    processed += group.length;
    await markCompaniesChecked(group.map((company) => company.id));
  }

  return {
    processed,
    skippedForTime: companies.length - processed,
    durationMs: deadline.elapsedMs(),
    concurrency,
    perUser: [...byUser.values()],
    sourceTallies: [...sourceTotals.values()],
  };
}

/**
 * Hämtar bolagen och söker igenom dem. Ingången för delfunktionen, som får
 * id:n över nätverket och inte hela poster.
 *
 * Ordningen från samordnaren bevaras med flit inte här — delen har redan fått
 * sin andel, och inom den spelar ordningen ingen roll eftersom den ändå
 * bearbetas i grupper.
 */
export async function runDiscoveryForCompanyIds(
  companyIds: readonly string[],
): Promise<ShardDiscoveryResult> {
  if (companyIds.length === 0) {
    return {
      processed: 0,
      skippedForTime: 0,
      durationMs: 0,
      concurrency: resolveConcurrency(),
      perUser: [],
      sourceTallies: [],
    };
  }

  const companies = await prisma.company.findMany({
    where: { id: { in: [...companyIds] } },
    include: {
      user: { select: { id: true, email: true, morningEmailOptOutAt: true } },
    },
  });

  return runDiscoveryForCompanies(companies);
}
