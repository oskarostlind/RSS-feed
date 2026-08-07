import { prisma } from "@/lib/prisma";
import type { JobAdHit } from "@/lib/jobs/types";

export interface PersistedJobAdRow {
  id: string;
  externalId: string;
  headline: string;
  employerName: string;
  occupation: string | null;
  municipality: string | null;
  url: string;
  publishedAt: Date | null;
}

export interface PersistJobAdsResult {
  created: number;
  skipped: number;
  createdItems: PersistedJobAdRow[];
}

const SELECT_ROW = {
  id: true,
  externalId: true,
  headline: true,
  employerName: true,
  occupation: true,
  municipality: true,
  url: true,
  publishedAt: true,
} as const;

/**
 * Sparar nya jobbannonser för ett bolag.
 *
 * Dedupliceringen sker på `externalId` och inte på URL. En annons kan
 * republiceras med ny länk men behåller sitt id, och att mejla samma tjänst
 * två gånger är precis den sortens brus som får en AM att sluta öppna mejlet.
 *
 * Avgränsat till bolaget av samma skäl som i `persistSearchHits`: samma
 * arbetsgivare kan bevakas av flera användare.
 */
export async function persistJobAds(
  companyId: string,
  hits: JobAdHit[],
): Promise<PersistJobAdsResult> {
  if (hits.length === 0) {
    return { created: 0, skipped: 0, createdItems: [] };
  }

  const externalIds = hits.map((hit) => hit.externalId);

  const existing = await prisma.jobAd.findMany({
    where: { companyId, externalId: { in: externalIds } },
    select: { externalId: true },
  });
  const existingIds = new Set(existing.map((row) => row.externalId));
  const newHits = hits.filter((hit) => !existingIds.has(hit.externalId));

  if (newHits.length === 0) {
    return { created: 0, skipped: hits.length, createdItems: [] };
  }

  await prisma.jobAd.createMany({
    data: newHits.map((hit) => ({
      companyId,
      externalId: hit.externalId,
      headline: hit.headline,
      employerName: hit.employerName,
      workplaceName: hit.workplaceName,
      organizationNumber: hit.organizationNumber,
      occupation: hit.occupation,
      municipality: hit.municipality,
      region: hit.region,
      url: hit.url,
      publishedAt: hit.publishedAt,
      deadline: hit.deadline,
    })),
    skipDuplicates: true,
  });

  const createdItems = await prisma.jobAd.findMany({
    where: {
      companyId,
      externalId: { in: newHits.map((hit) => hit.externalId) },
    },
    select: SELECT_ROW,
  });

  return {
    created: createdItems.length,
    skipped: hits.length - createdItems.length,
    createdItems,
  };
}
