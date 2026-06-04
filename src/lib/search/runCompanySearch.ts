import { persistSearchHitsAsPending } from "@/lib/news/persistSearchHits";
import { SearchService } from "@/lib/search/SearchService";

export interface CompanySearchJobResult {
  companyId: string;
  companyName: string;
  found: number;
  created: number;
  skipped: number;
}

export async function runCompanySearch(
  companyId: string,
  companyName: string,
  searchService: SearchService,
): Promise<CompanySearchJobResult> {
  const hits = await searchService.searchForCompany(companyName);
  const { created, skipped } = await persistSearchHitsAsPending(
    companyId,
    hits,
  );

  return {
    companyId,
    companyName,
    found: hits.length,
    created,
    skipped,
  };
}
