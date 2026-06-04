import { NewsItemStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import type { SearchHit } from "@/lib/search/types";

export interface PersistedNewsItemRow {
  id: string;
  title: string;
  snippet: string | null;
  url: string;
  publishedAt: Date | null;
}

export interface PersistSearchHitsResult {
  created: number;
  skipped: number;
  createdItems: PersistedNewsItemRow[];
}

export async function persistSearchHitsAsPending(
  companyId: string,
  hits: SearchHit[],
): Promise<PersistSearchHitsResult> {
  if (hits.length === 0) {
    return { created: 0, skipped: 0, createdItems: [] };
  }

  const urls = hits.map((hit) => hit.url);
  const existing = await prisma.newsItem.findMany({
    where: { url: { in: urls } },
    select: { url: true },
  });
  const existingUrls = new Set(existing.map((item) => item.url));
  const newHits = hits.filter((hit) => !existingUrls.has(hit.url));

  if (newHits.length === 0) {
    return { created: 0, skipped: hits.length, createdItems: [] };
  }

  await prisma.newsItem.createMany({
    data: newHits.map((hit) => ({
      companyId,
      title: hit.title,
      snippet: hit.snippet,
      url: hit.url,
      publishedAt: hit.publishedAt,
      status: NewsItemStatus.PENDING,
    })),
  });

  const createdItems = await prisma.newsItem.findMany({
    where: {
      companyId,
      url: { in: newHits.map((hit) => hit.url) },
    },
    select: {
      id: true,
      title: true,
      snippet: true,
      url: true,
      publishedAt: true,
    },
  });

  return {
    created: createdItems.length,
    skipped: hits.length - createdItems.length,
    createdItems,
  };
}
