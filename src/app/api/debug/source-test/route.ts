import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
import { buildQueryVariants } from "@/lib/search/companyQuery";
import { filterAndRankHits } from "@/lib/search/relevance";
import { RssFeedService } from "@/lib/search/RssFeedService";
import { ScraperService } from "@/lib/search/ScraperService";
import { SearchService } from "@/lib/search/SearchService";
import type { SearchHit } from "@/lib/search/types";
import { formatErrorMessage } from "@/lib/utils/formatError";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Diagnostikendpoint: kör en eller flera nyhetskällor mot ett fritt angivet
 * bolagsnamn och returnerar de råa träffarna som JSON.
 *
 * Skriver aldrig till databasen — den är till för att utvärdera källornas
 * täckning och parsning i skarp miljö, där utgående nätverk faktiskt fungerar.
 *
 *   GET /api/debug/source-test?secret=<CRON_SECRET>&company=Peges%20i%20Ljusdal%20AB
 *   GET /api/debug/source-test?secret=...&company=...&source=google-rss
 *   GET /api/debug/source-test?secret=...&company=...&verbose=1
 */

type SourceName = "google-rss" | "bing-rss" | "gnews" | "scrape";

/** Skrapningen körs bara på begäran — den har visat sig ge noll träffar. */
const DEFAULT_SOURCES: readonly SourceName[] = [
  "google-rss",
  "bing-rss",
  "gnews",
] as const;

const ALL_SOURCES: readonly SourceName[] = [
  ...DEFAULT_SOURCES,
  "scrape",
] as const;

interface SourceOutcome {
  source: SourceName;
  ok: boolean;
  durationMs: number;
  count: number;
  hits: SearchHit[];
  error: string | null;
}

function parseRequestedSources(value: string | null): SourceName[] {
  if (!value) {
    return [...DEFAULT_SOURCES];
  }

  if (value === "all") {
    return [...ALL_SOURCES];
  }

  const requested = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is SourceName =>
      (ALL_SOURCES as readonly string[]).includes(entry),
    );

  return requested.length > 0 ? requested : [...DEFAULT_SOURCES];
}

async function runSource(
  source: SourceName,
  companyName: string,
): Promise<SourceOutcome> {
  const startedAt = Date.now();

  try {
    let hits: SearchHit[];

    switch (source) {
      case "google-rss":
        hits = await new RssFeedService().searchForCompany(companyName, [
          "googleNews",
        ]);
        break;
      case "bing-rss":
        hits = await new RssFeedService().searchForCompany(companyName, [
          "bingNews",
        ]);
        break;
      case "gnews":
        hits = await SearchService.fromEnv().searchForCompany(companyName);
        break;
      case "scrape":
        hits = await new ScraperService().scrapeForCompany(companyName);
        break;
    }

    return {
      source,
      ok: true,
      durationMs: Date.now() - startedAt,
      count: hits.length,
      hits,
      error: null,
    };
  } catch (error) {
    return {
      source,
      ok: false,
      durationMs: Date.now() - startedAt,
      count: 0,
      hits: [],
      error: formatErrorMessage(error),
    };
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const unauthorized = verifyCronSecret(request);
  if (unauthorized) {
    return unauthorized;
  }

  const params = new URL(request.url).searchParams;
  const companyName = params.get("company")?.trim();

  if (!companyName) {
    return NextResponse.json(
      { error: "Missing required query parameter: company" },
      { status: 400 },
    );
  }

  const verbose = params.get("verbose") === "1";
  const sources = parseRequestedSources(params.get("source"));
  const results = await Promise.all(
    sources.map((source) => runSource(source, companyName)),
  );

  const seen = new Set<string>();
  const mergedHits = results
    .flatMap((result) => result.hits)
    .filter((hit) => {
      if (seen.has(hit.url)) {
        return false;
      }

      seen.add(hit.url);
      return true;
    });

  const { kept, rejected } = filterAndRankHits(mergedHits, companyName);

  return NextResponse.json({
    companyName,
    queries: buildQueryVariants(companyName),
    ranAt: new Date().toISOString(),
    totalHits: results.reduce((sum, result) => sum + result.count, 0),
    uniqueHits: mergedHits.length,
    relevant: kept.length,
    filteredOut: rejected.length,
    perSource: results.map(({ hits, ...summary }) => ({
      ...summary,
      ...(verbose ? { hits } : {}),
    })),
    relevantHits: kept,
    rejectedHits: verbose ? rejected : rejected.slice(0, 10),
  });
}
