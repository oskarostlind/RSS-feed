import type { MorningSummaryNewsItem } from "@/lib/email/EmailService";
import { prisma } from "@/lib/prisma";
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
  results: CompanyDiscoveryResult[];
  createdNewsItems: MorningSummaryNewsItem[];
  possibleNewsItems: MorningSummaryNewsItem[];
}

export interface DiscoveryJobResult {
  companiesProcessed: number;
  usersProcessed: number;
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

export async function executeDiscoveryJob(
  companyId?: string,
): Promise<DiscoveryJobResult> {
  const companies = companyId
    ? await prisma.company.findMany({
        where: { id: companyId },
        include: { user: { select: { id: true, email: true } } },
      })
    : await prisma.company.findMany({
        include: { user: { select: { id: true, email: true } } },
      });

  if (companyId && companies.length === 0) {
    throw new Error("COMPANY_NOT_FOUND");
  }

  if (companies.length === 0) {
    throw new Error("NO_COMPANIES");
  }

  const searchService = SearchService.fromEnv();
  const rssFeedService = new RssFeedService();

  const byUser = new Map<string, UserDiscoveryResult>();

  for (const company of companies) {
    const result = await runCompanyDiscovery(
      company.id,
      company.name,
      searchService,
      rssFeedService,
    );

    let entry = byUser.get(company.userId);

    if (!entry) {
      entry = {
        userId: company.userId,
        email: company.user.email,
        emailDeliverable: isDeliverableEmail(company.user.email),
        results: [],
        createdNewsItems: [],
        possibleNewsItems: [],
      };
      byUser.set(company.userId, entry);
    }

    entry.results.push(result);
    entry.createdNewsItems.push(...result.createdItems);
    entry.possibleNewsItems.push(...result.createdPossibleItems);
  }

  const perUser = [...byUser.values()];
  const results = perUser.flatMap((entry) => entry.results);

  return {
    companiesProcessed: companies.length,
    usersProcessed: perUser.length,
    perUser,
    results,
    createdNewsItems: perUser.flatMap((entry) => entry.createdNewsItems),
  };
}
