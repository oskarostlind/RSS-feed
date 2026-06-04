import { NewsItemStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface CompanyRow {
  id: string;
  name: string;
  createdAt: Date;
  unreadCount: number;
  totalCount: number;
}

export interface CompanyDetail {
  id: string;
  name: string;
}

export interface CompanyNewsHistoryRow {
  id: string;
  title: string;
  snippet: string | null;
  url: string;
  status: (typeof NewsItemStatus)[keyof typeof NewsItemStatus];
  publishedAt: Date | null;
  createdAt: Date;
}

export function getThirtyDaysAgo(): Date {
  return new Date(Date.now() - THIRTY_DAYS_MS);
}

export async function getAllCompanies(): Promise<CompanyRow[]> {
  const [companies, pendingByCompany] = await Promise.all([
    prisma.company.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: {
          select: { newsItems: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.newsItem.groupBy({
      by: ["companyId"],
      where: { status: NewsItemStatus.PENDING },
      _count: { _all: true },
    }),
  ]);

  const pendingCountByCompanyId = new Map(
    pendingByCompany.map((row) => [row.companyId, row._count._all]),
  );

  return companies.map((company) => ({
    id: company.id,
    name: company.name,
    createdAt: company.createdAt,
    unreadCount: pendingCountByCompanyId.get(company.id) ?? 0,
    totalCount: company._count.newsItems,
  }));
}

export async function getCompanyById(
  companyId: string,
): Promise<CompanyDetail | null> {
  return prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
}

export async function getCompanyNewsHistory(
  companyId: string,
): Promise<CompanyNewsHistoryRow[]> {
  const since = getThirtyDaysAgo();

  return prisma.newsItem.findMany({
    where: {
      companyId,
      OR: [{ createdAt: { gte: since } }, { publishedAt: { gte: since } }],
    },
    select: {
      id: true,
      title: true,
      snippet: true,
      url: true,
      status: true,
      publishedAt: true,
      createdAt: true,
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });
}
