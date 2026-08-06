import type { MorningSummaryNewsItem } from "@/lib/email/EmailService";
import { persistSearchHitsAsPending } from "@/lib/news/persistSearchHits";
import { filterAndRankHits } from "@/lib/search/relevance";
import { RssFeedService } from "@/lib/search/RssFeedService";
import { SearchService } from "@/lib/search/SearchService";
import type { SearchHit } from "@/lib/search/types";

export interface CompanyDiscoveryResult {
  companyId: string;
  companyName: string;
  rssFound: number;
  gnewsFound: number;
  found: number;
  relevant: number;
  filteredOut: number;
  created: number;
  skipped: number;
  createdItems: MorningSummaryNewsItem[];
}

function dedupeHitsByUrl(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();

  return hits.filter((hit) => {
    if (seen.has(hit.url)) {
      return false;
    }

    seen.add(hit.url);
    return true;
  });
}

/**
 * En källa som fallerar får inte sänka hela morgonkörningen — de andra
 * källorna är fortfarande värda att spara.
 */
async function collectSafely(
  label: string,
  companyName: string,
  run: () => Promise<SearchHit[]>,
): Promise<SearchHit[]> {
  try {
    return await run();
  } catch (error) {
    console.error(`${label} failed for "${companyName}":`, error);
    return [];
  }
}

export async function runCompanyDiscovery(
  companyId: string,
  companyName: string,
  searchService: SearchService,
  rssFeedService: RssFeedService,
): Promise<CompanyDiscoveryResult> {
  const [rssHits, gnewsHits] = await Promise.all([
    collectSafely("RSS discovery", companyName, () =>
      rssFeedService.searchForCompany(companyName),
    ),
    collectSafely("GNews discovery", companyName, () =>
      searchService.searchForCompany(companyName),
    ),
  ]);

  const mergedHits = dedupeHitsByUrl([...rssHits, ...gnewsHits]);
  const { kept, rejected } = filterAndRankHits(mergedHits, companyName);

  const { created, skipped, createdItems } = await persistSearchHitsAsPending(
    companyId,
    kept,
  );

  return {
    companyId,
    companyName,
    rssFound: rssHits.length,
    gnewsFound: gnewsHits.length,
    found: mergedHits.length,
    relevant: kept.length,
    filteredOut: rejected.length,
    created,
    skipped,
    createdItems: createdItems.map((item) => ({
      ...item,
      companyName,
    })),
  };
}
