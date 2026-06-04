import { prisma } from "@/lib/prisma";

export interface CompanyRow {
  id: string;
  name: string;
  createdAt: Date;
  _count: {
    newsItems: number;
  };
}

export async function getAllCompanies(): Promise<CompanyRow[]> {
  return prisma.company.findMany({
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: {
        select: { newsItems: true },
      },
    },
    orderBy: { name: "asc" },
  });
}
