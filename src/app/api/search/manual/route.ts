import { NextResponse } from "next/server";
import { buildSearchErrorResponse } from "@/lib/api/searchErrorResponse";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
import { executeDiscoveryJob } from "@/lib/search/executeDiscoveryJob";
import { SearchServiceError } from "@/lib/search/SearchService";

interface ManualSearchBody {
  companyId?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = verifyCronSecret(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    let companyId: string | undefined;

    try {
      const body = (await request.json()) as ManualSearchBody;
      companyId = body.companyId;
    } catch {
      companyId = undefined;
    }

    const result = await executeDiscoveryJob({ companyId });
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

    console.error("Manual search failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
