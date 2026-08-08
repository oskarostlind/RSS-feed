import type { MorningSummaryNewsItem } from "@/lib/email/EmailService";
import type { MorningSummaryJobAd } from "@/lib/jobs/runCompanyJobSearch";
import type { CompanyDiscoveryResult } from "@/lib/search/runCompanyDiscovery";
import type {
  ShardDiscoveryResult,
  ShardUserResult,
} from "@/lib/search/runDiscoveryShard";

/**
 * Samordnarens sida av fan-out: att anropa en delkörning och tolka svaret.
 *
 * Två saker gör det här till en egen modul i stället för några rader i
 * `executeDiscoveryJob`.
 *
 * **Datumen överlever inte JSON.** `publishedAt` är ett `Date` i koden men en
 * sträng efter `JSON.parse`. Typerna säger fortfarande `Date`, så inget
 * fångar det förrän mejlmallen försöker formatera en sträng — alltså kl 07,
 * i en mall ingen tittar på. Återställningen nedan finns för att det felet
 * inte ska kunna uppstå tyst.
 *
 * **En del som inte svarar får inte sänka morgonen.** Anropet kan misslyckas
 * på alla vanliga sätt ett nätverksanrop kan. Utfallet blir då att delens
 * bolag inte fick sin markör flyttad, vilket betyder att de ligger först i
 * nästa körning — samma mekanism som redan hanterar att tidsbudgeten tar slut.
 * De övriga delarnas artiklar mejlas som vanligt.
 */

/** Sekunder att vänta innan en del ges upp. */
const SHARD_TIMEOUT_MS = 55_000;

function reviveDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value as string);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function reviveNewsItem(item: MorningSummaryNewsItem): MorningSummaryNewsItem {
  return { ...item, publishedAt: reviveDate(item.publishedAt) };
}

function reviveJobAd(item: MorningSummaryJobAd): MorningSummaryJobAd {
  return { ...item, publishedAt: reviveDate(item.publishedAt) };
}

function reviveCompanyResult(
  result: CompanyDiscoveryResult,
): CompanyDiscoveryResult {
  return {
    ...result,
    createdItems: result.createdItems.map(reviveNewsItem),
    createdPossibleItems: result.createdPossibleItems.map(reviveNewsItem),
    jobs: {
      ...result.jobs,
      createdItems: result.jobs.createdItems.map(reviveJobAd),
    },
  };
}

function reviveUser(user: ShardUserResult): ShardUserResult {
  return { ...user, results: user.results.map(reviveCompanyResult) };
}

export function reviveShardResult(
  result: ShardDiscoveryResult,
): ShardDiscoveryResult {
  return { ...result, perUser: result.perUser.map(reviveUser) };
}

/**
 * Anropar en delkörning. Null när den inte gick att nå — anroparen ska då
 * fortsätta med de delar som svarade, inte avbryta.
 */
export async function callDiscoveryShard(
  baseUrl: string,
  companyIds: string[],
  secret: string,
): Promise<ShardDiscoveryResult | null> {
  const url = new URL("/api/internal/discovery-shard", baseUrl);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Samma hemlighet som morgonjobbet självt kräver. Rutten är inte
        // svagare skyddad för att den är intern — den startar exakt samma
        // arbete och kostar exakt lika många utgående anrop.
        "x-cron-secret": secret,
      },
      body: JSON.stringify({ companyIds }),
      signal: AbortSignal.timeout(SHARD_TIMEOUT_MS),
      // Ett svar på en sökning får aldrig komma ur en cache. Utan detta kan
      // en morgon serveras gårdagens artiklar och rapportera dem som nya.
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        `Delkörningen svarade ${response.status} för ${companyIds.length} bolag.`,
      );
      return null;
    }

    return reviveShardResult((await response.json()) as ShardDiscoveryResult);
  } catch (error) {
    console.error(
      `Delkörningen kunde inte nås för ${companyIds.length} bolag:`,
      error,
    );
    return null;
  }
}
