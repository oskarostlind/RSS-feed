import { filterJobAdsByEmployer } from "@/lib/jobs/employerMatch";
import { JobTechService } from "@/lib/jobs/JobTechService";
import { persistJobAds, type PersistedJobAdRow } from "@/lib/jobs/persistJobAds";

export interface MorningSummaryJobAd extends PersistedJobAdRow {
  companyName: string;
}

export interface CompanyJobSearchResult {
  /** Falskt när JobTech-anropet kastade. Skiljer tomt svar från trasig källa. */
  ok: boolean;
  /** Antal annonser fritextsökningen gav, före arbetsgivarmatchning. */
  found: number;
  /** Antal som faktiskt har bolaget som arbetsgivare. */
  matched: number;
  created: number;
  skipped: number;
  /** Nya annonser äldre än tidsfönstret — sparade, men inte mejlade. */
  archived: number;
  createdItems: MorningSummaryJobAd[];
}

export const EMPTY_JOB_SEARCH_RESULT: CompanyJobSearchResult = {
  ok: true,
  found: 0,
  matched: 0,
  created: 0,
  skipped: 0,
  archived: 0,
  createdItems: [],
};

/**
 * Hämtar, filtrerar och sparar jobbannonser för ett bolag.
 *
 * Tidsfönstret läggs på av anroparen, tillsammans med nyheternas — annonser
 * och artiklar ska bedömas mot samma dygnsgräns, annars blir mejlets innehåll
 * inkonsekvent.
 */
export async function runCompanyJobSearch(
  companyId: string,
  companyName: string,
  jobTechService: JobTechService,
): Promise<Omit<CompanyJobSearchResult, "archived">> {
  const hits = await jobTechService.searchForCompany(companyName);
  const { matched } = filterJobAdsByEmployer(hits, companyName);

  const { created, skipped, createdItems } = await persistJobAds(
    companyId,
    matched,
  );

  return {
    ok: true,
    found: hits.length,
    matched: matched.length,
    created,
    skipped,
    createdItems: createdItems.map((item) => ({ ...item, companyName })),
  };
}
