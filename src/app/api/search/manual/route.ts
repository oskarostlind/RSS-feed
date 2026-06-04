import { NextResponse } from "next/server";
import { buildSearchErrorResponse } from "@/lib/api/searchErrorResponse";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
import { prisma } from "@/lib/prisma";
import {
  SearchService,
  SearchServiceError,
} from "@/lib/search/SearchService";
import { runCompanySearch } from "@/lib/search/runCompanySearch";

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

    const companies = companyId
      ? await prisma.company.findMany({ where: { id: companyId } })
      : await prisma.company.findMany();

    if (companyId && companies.length === 0) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (companies.length === 0) {
      return NextResponse.json(
        { error: "No companies in database. Run prisma db seed first." },
        { status: 404 },
      );
    }

    const searchService = SearchService.fromEnv();
    const results = [];

    for (const company of companies) {
      const result = await runCompanySearch(
        company.id,
        company.name,
        searchService,
      );
      results.push(result);
    }

    return NextResponse.json({
      companiesProcessed: companies.length,
      results,
    });
  } catch (error) {
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
