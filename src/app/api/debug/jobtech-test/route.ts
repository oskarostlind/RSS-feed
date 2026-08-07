import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
import { filterJobAdsByEmployer } from "@/lib/jobs/employerMatch";
import { buildJobTechQuery, JobTechService } from "@/lib/jobs/JobTechService";
import { formatErrorMessage } from "@/lib/utils/formatError";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Diagnostikendpoint för jobbannonskällan. Skriver aldrig till databasen.
 *
 * Visar både matchade och bortsorterade annonser, eftersom det intressanta
 * felet här inte är "noll träffar" utan "fel arbetsgivare släpptes igenom" —
 * bemanningsbolag som annonserar *till* bolaget är den vanligaste falska
 * positiven, och den syns bara om man ser vad spärren kastade.
 *
 *   GET /api/debug/jobtech-test?secret=<CRON_SECRET>&company=Peges%20i%20Ljusdal%20AB
 */
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

  const startedAt = Date.now();

  try {
    const hits = await new JobTechService().searchForCompany(companyName);
    const { matched, rejected } = filterJobAdsByEmployer(hits, companyName);

    return NextResponse.json({
      companyName,
      query: buildJobTechQuery(companyName),
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      found: hits.length,
      matchedCount: matched.length,
      rejectedCount: rejected.length,
      matched,
      rejected: rejected.map((hit) => ({
        headline: hit.headline,
        employerName: hit.employerName,
        workplaceName: hit.workplaceName,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        companyName,
        durationMs: Date.now() - startedAt,
        error: formatErrorMessage(error),
      },
      { status: 502 },
    );
  }
}
