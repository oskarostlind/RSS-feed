import { NextResponse } from "next/server";
import { buildSearchErrorResponse } from "@/lib/api/searchErrorResponse";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
import { executeDiscoveryJob } from "@/lib/search/executeDiscoveryJob";
import { SearchServiceError } from "@/lib/search/SearchService";

export async function GET(request: Request): Promise<NextResponse> {
  const unauthorized = verifyCronSecret(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const result = await executeDiscoveryJob();
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "COMPANY_NOT_FOUND") {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (error instanceof Error && error.message === "NO_COMPANIES") {
      return NextResponse.json(
        { error: "No companies in database. Run prisma db seed first." },
        { status: 404 },
      );
    }

    if (error instanceof SearchServiceError) {
      return NextResponse.json(buildSearchErrorResponse(error), {
        status: 502,
      });
    }

    console.error("Cron discovery job failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
