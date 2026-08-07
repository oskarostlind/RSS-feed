import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
import { filterAndRankHits } from "@/lib/search/relevance";
import { resolveWindowDays, splitByRecency } from "@/lib/search/recency";
import { RssFeedService } from "@/lib/search/RssFeedService";
import { SearchService } from "@/lib/search/SearchService";
import type { SearchHit } from "@/lib/search/types";
import { formatErrorMessage } from "@/lib/utils/formatError";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Mäter vad varje källa **bidrar med**, över flera bolag, i ett kompakt svar.
 *
 * Skild från `/api/debug/source-test`, som svarar med varje träff i sin helhet.
 * Den formen är rätt när man felsöker ett bolag och fel när frågan är om en
 * källa är värd att behålla — då behövs många bolag, och svaret blir för stort
 * för att läsa. Här återges inga träffar alls, bara räkningar.
 *
 * Frågan endpointen finns för är §9.9 i PROJECT.md: bidrar GNews något som de
 * två RSS-källorna inte redan ger?
 *
 *   GET /api/debug/source-coverage?secret=<CRON_SECRET>&companies=Bolag%20A|Bolag%20B
 */

type SourceName = "google-rss" | "bing-rss" | "gnews";

const SOURCES: readonly SourceName[] = [
  "google-rss",
  "bing-rss",
  "gnews",
] as const;

/**
 * Taket finns för GNews skull, inte för tidens. Gratisnivån har en dygnskvot,
 * och en mätning som råkar bränna den slår ut morgonjobbet samma dygn.
 */
const MAX_COMPANIES = 10;

interface SourceMeasurement {
  source: SourceName;
  ok: boolean;
  error: string | null;
  durationMs: number;
  /** Allt källan gav, före relevansfilter. */
  count: number;
  /** Träffar som ingen annan källa hittade. */
  uniqueCount: number;
  /** Unika träffar som dessutom är relevanta och inom tidsfönstret. */
  uniqueMailable: number;
}

interface CompanyMeasurement {
  company: string;
  totalHits: number;
  relevant: number;
  mailable: number;
  perSource: SourceMeasurement[];
}

interface SourceRun {
  source: SourceName;
  ok: boolean;
  error: string | null;
  durationMs: number;
  hits: SearchHit[];
}

/**
 * Samma artikel har olika URL i olika källor: Google News lämnar en krypterad
 * omdirigeringslänk, GNews publicistens riktiga adress. Att räkna unikhet på
 * URL ensamt skulle därför få varje källa att se unik ut, vilket är precis
 * det felslut mätningen ska undvika. Rubriken är det enda som är gemensamt.
 */
function titleKey(hit: SearchHit): string {
  return hit.title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9åäö ]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function identityKeys(hit: SearchHit): string[] {
  const keys = [`url:${hit.url}`];
  const title = titleKey(hit);

  // Mycket korta rubriker blir tvetydiga nycklar och skulle slå ihop
  // artiklar som inte hör ihop. Då är URL:en det säkraste vi har.
  if (title.length >= 12) {
    keys.push(`title:${title}`);
  }

  return keys;
}

async function runSource(
  source: SourceName,
  companyName: string,
): Promise<SourceRun> {
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
    }

    return {
      source,
      ok: true,
      error: null,
      durationMs: Date.now() - startedAt,
      hits,
    };
  } catch (error) {
    // Per källa, inte per körning: en trasig källa ska inte dölja vad de
    // andra gav — det är hela poängen med att ha flera.
    return {
      source,
      ok: false,
      error: formatErrorMessage(error),
      durationMs: Date.now() - startedAt,
      hits: [],
    };
  }
}

/**
 * "Mejlbar" = relevant enligt rankningen och inom tidsfönstret. Det är den
 * enda tröskel som betyder något för användaren; en träff som aldrig når
 * mejlet är inte ett bidrag.
 */
function mailableKeySet(
  hits: SearchHit[],
  companyName: string,
  now: Date,
  windowDays: number,
): Set<string> {
  const { kept } = filterAndRankHits(hits, companyName);
  const { fresh } = splitByRecency(kept, now, windowDays);

  return new Set(fresh.flatMap(identityKeys));
}

function measureCompany(
  companyName: string,
  runs: SourceRun[],
  now: Date,
  windowDays: number,
): CompanyMeasurement {
  const allHits = runs.flatMap((run) => run.hits);

  const seen = new Set<string>();
  const merged = allHits.filter((hit) => {
    const keys = identityKeys(hit);
    if (keys.some((key) => seen.has(key))) {
      return false;
    }

    for (const key of keys) {
      seen.add(key);
    }
    return true;
  });

  const { kept } = filterAndRankHits(merged, companyName);
  const { fresh } = splitByRecency(kept, now, windowDays);
  const mailable = new Set(fresh.flatMap(identityKeys));

  const perSource = runs.map((run): SourceMeasurement => {
    const othersKeys = new Set(
      runs
        .filter((other) => other.source !== run.source)
        .flatMap((other) => other.hits)
        .flatMap(identityKeys),
    );

    const uniqueHits = run.hits.filter(
      (hit) => !identityKeys(hit).some((key) => othersKeys.has(key)),
    );

    const uniqueMailable = uniqueHits.filter((hit) =>
      identityKeys(hit).some((key) => mailable.has(key)),
    );

    return {
      source: run.source,
      ok: run.ok,
      error: run.error,
      durationMs: run.durationMs,
      count: run.hits.length,
      uniqueCount: uniqueHits.length,
      uniqueMailable: uniqueMailable.length,
    };
  });

  return {
    company: companyName,
    totalHits: allHits.length,
    relevant: kept.length,
    mailable: fresh.length,
    perSource,
  };
}

function parseCompanies(raw: string | null): string[] {
  if (!raw) {
    return [];
  }

  const seen = new Set<string>();

  return raw
    .split("|")
    .map((entry) => entry.trim())
    .filter((entry) => {
      if (entry.length === 0 || seen.has(entry.toLowerCase())) {
        return false;
      }
      seen.add(entry.toLowerCase());
      return true;
    })
    .slice(0, MAX_COMPANIES);
}

export async function GET(request: Request): Promise<NextResponse> {
  const unauthorized = verifyCronSecret(request);
  if (unauthorized) {
    return unauthorized;
  }

  const params = new URL(request.url).searchParams;
  const companies = parseCompanies(params.get("companies"));

  if (companies.length === 0) {
    return NextResponse.json(
      {
        error:
          "Missing required query parameter: companies (pipe-separated, e.g. companies=Bolag A|Bolag B)",
      },
      { status: 400 },
    );
  }

  const now = new Date();
  const windowDays = resolveWindowDays();
  const measurements: CompanyMeasurement[] = [];

  // Bolagen körs ett i taget med flit. Parallella bolag betyder parallella
  // GNews-anrop, och det var precis så gratisnivån gav 429 den 2026-08-07.
  for (const company of companies) {
    const runs = await Promise.all(
      SOURCES.map((source) => runSource(source, company)),
    );
    measurements.push(measureCompany(company, runs, now, windowDays));
  }

  const totals = SOURCES.map((source) => {
    const rows = measurements.flatMap((measurement) =>
      measurement.perSource.filter((entry) => entry.source === source),
    );

    return {
      source,
      failures: rows.filter((row) => !row.ok).length,
      count: rows.reduce((sum, row) => sum + row.count, 0),
      uniqueCount: rows.reduce((sum, row) => sum + row.uniqueCount, 0),
      uniqueMailable: rows.reduce((sum, row) => sum + row.uniqueMailable, 0),
      /** Antal bolag där källan var ensam om minst en mejlbar träff. */
      companiesWithUniqueMailable: rows.filter((row) => row.uniqueMailable > 0)
        .length,
    };
  });

  return NextResponse.json({
    ranAt: now.toISOString(),
    windowDays,
    companiesMeasured: companies.length,
    totals,
    perCompany: measurements,
  });
}
