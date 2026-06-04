import { NewsItemStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export interface CompanyRow {
  id: string;
  name: string;
  createdAt: Date;
  unreadCount: number;
  totalCount: number;
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

export interface CompanyWithNewsItems {
  id: string;
  name: string;
  newsItems: CompanyNewsHistoryRow[];
}

export async function getAllCompanies(userId: string): Promise<CompanyRow[]> {
  const [companies, pendingByCompany] = await Promise.all([
    prisma.company.findMany({
      where: { userId },
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
      where: {
        status: NewsItemStatus.PENDING,
        company: { userId },
      },
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

export async function getCompanyWithNewsItems(
  companyId: string,
  userId: string,
): Promise<CompanyWithNewsItems | null> {
  return prisma.company.findFirst({
    where: {
      id: companyId,
      userId,
    },
    select: {
      id: true,
      name: true,
      newsItems: {
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
      },
    },
  });
}

export async function companyBelongsToUser(
  companyId: string,
  userId: string,
): Promise<boolean> {
  const company = await prisma.company.findFirst({
    where: {
      id: companyId,
      userId,
    },
    select: { id: true },
  });

  return company !== null;
}
