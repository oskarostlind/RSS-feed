import { NewsItemStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import type { SearchHit } from "@/lib/search/types";

export interface PersistSearchHitsResult {
  created: number;
  skipped: number;
}

export async function persistSearchHitsAsPending(
  companyId: string,
  hits: SearchHit[],
): Promise<PersistSearchHitsResult> {
  if (hits.length === 0) {
    return { created: 0, skipped: 0 };
  }

  const result = await prisma.newsItem.createMany({
    data: hits.map((hit) => ({
      companyId,
      title: hit.title,
      snippet: hit.snippet,
      url: hit.url,
      publishedAt: hit.publishedAt,
      status: NewsItemStatus.PENDING,
    })),
    skipDuplicates: true,
  });

  return {
    created: result.count,
    skipped: hits.length - result.count,
  };
}
