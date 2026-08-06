import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
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
 *   GET /api/debug/source-test?secret=...&company=...&source=gnews
 */

type SourceName = "gnews" | "scrape";

const ALL_SOURCES: readonly SourceName[] = ["gnews", "scrape"] as const;

interface SourceOutcome {
  source: SourceName;
  ok: boolean;
  durationMs: number;
  count: number;
  hits: SearchHit[];
  error: string | null;
}

function parseRequestedSources(value: string | null): SourceName[] {
  if (!value || value === "all") {
    return [...ALL_SOURCES];
  }

  const requested = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is SourceName =>
      (ALL_SOURCES as readonly string[]).includes(entry),
    );

  return requested.length > 0 ? requested : [...ALL_SOURCES];
}

async function runSource(
  source: SourceName,
  companyName: string,
): Promise<SourceOutcome> {
  const startedAt = Date.now();

  try {
    let hits: SearchHit[];

    switch (source) {
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

  const sources = parseRequestedSources(params.get("source"));
  const results = await Promise.all(
    sources.map((source) => runSource(source, companyName)),
  );

  const uniqueUrls = new Set(
    results.flatMap((result) => result.hits.map((hit) => hit.url)),
  );

  return NextResponse.json({
    companyName,
    ranAt: new Date().toISOString(),
    totalHits: results.reduce((sum, result) => sum + result.count, 0),
    uniqueUrls: uniqueUrls.size,
    results,
  });
}
