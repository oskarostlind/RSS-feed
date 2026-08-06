import type { MorningSummaryNewsItem } from "@/lib/email/EmailService";
import { prisma } from "@/lib/prisma";
import { RssFeedService } from "@/lib/search/RssFeedService";
import { SearchService } from "@/lib/search/SearchService";
import {
  runCompanyDiscovery,
  type CompanyDiscoveryResult,
} from "@/lib/search/runCompanyDiscovery";

export interface DiscoveryJobResult {
  companiesProcessed: number;
  results: CompanyDiscoveryResult[];
  createdNewsItems: MorningSummaryNewsItem[];
}

export async function executeDiscoveryJob(
  companyId?: string,
): Promise<DiscoveryJobResult> {
  const companies = companyId
    ? await prisma.company.findMany({ where: { id: companyId } })
    : await prisma.company.findMany();

  if (companyId && companies.length === 0) {
    throw new Error("COMPANY_NOT_FOUND");
  }

  if (companies.length === 0) {
    throw new Error("NO_COMPANIES");
  }

  const searchService = SearchService.fromEnv();
  const rssFeedService = new RssFeedService();
  const results: CompanyDiscoveryResult[] = [];

  for (const company of companies) {
    const result = await runCompanyDiscovery(
      company.id,
      company.name,
      searchService,
      rssFeedService,
    );
    results.push(result);
  }

  const createdNewsItems = results.flatMap((result) => result.createdItems);

  return {
    companiesProcessed: companies.length,
    results,
    createdNewsItems,
  };
}
