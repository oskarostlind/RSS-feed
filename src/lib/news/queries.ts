import { NewsItemStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export interface PendingNewsItemRow {
  id: string;
  title: string;
  snippet: string | null;
  url: string;
  publishedAt: Date | null;
  createdAt: Date;
  company: {
    name: string;
  };
}

export async function getPendingNewsItems(): Promise<PendingNewsItemRow[]> {
  return prisma.newsItem.findMany({
    where: { status: NewsItemStatus.PENDING },
    select: {
      id: true,
      title: true,
      snippet: true,
      url: true,
      publishedAt: true,
      createdAt: true,
      company: {
        select: { name: true },
      },
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });
}
