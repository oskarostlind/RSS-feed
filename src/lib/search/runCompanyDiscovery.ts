import { persistSearchHitsAsPending } from "@/lib/news/persistSearchHits";
import type { SearchHit } from "@/lib/search/types";
import { ScraperService } from "@/lib/search/ScraperService";
import { SearchService } from "@/lib/search/SearchService";

export interface CompanyDiscoveryResult {
  companyId: string;
  companyName: string;
  gnewsFound: number;
  scrapeFound: number;
  found: number;
  created: number;
  skipped: number;
}

function dedupeHitsByUrl(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const unique: SearchHit[] = [];

  for (const hit of hits) {
    if (seen.has(hit.url)) {
      continue;
    }

    seen.add(hit.url);
    unique.push(hit);
  }

  return unique;
}

export async function runCompanyDiscovery(
  companyId: string,
  companyName: string,
  searchService: SearchService,
  scraperService: ScraperService,
): Promise<CompanyDiscoveryResult> {
  const gnewsHits = await searchService.searchForCompany(companyName);
  const scrapeHits = await scraperService.scrapeForCompany(companyName);
  const mergedHits = dedupeHitsByUrl([...gnewsHits, ...scrapeHits]);
  const { created, skipped } = await persistSearchHitsAsPending(
    companyId,
    mergedHits,
  );

  return {
    companyId,
    companyName,
    gnewsFound: gnewsHits.length,
    scrapeFound: scrapeHits.length,
    found: mergedHits.length,
    created,
    skipped,
  };
}
