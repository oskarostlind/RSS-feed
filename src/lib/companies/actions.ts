"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequiredUserId } from "@/lib/auth";
import { companyBelongsToUser } from "@/lib/companies/queries";
import { prisma } from "@/lib/prisma";
import { executeDiscoveryJob } from "@/lib/search/executeDiscoveryJob";
import { SearchServiceError } from "@/lib/search/SearchService";

const COMPANIES_PATH = "/dashboard/companies";

function revalidateCompanyViews(companyId?: string): void {
  revalidatePath(COMPANIES_PATH);
  revalidatePath("/dashboard");

  if (companyId) {
    revalidatePath(`${COMPANIES_PATH}/${companyId}`);
  }
}

export async function addCompany(formData: FormData): Promise<void> {
  const userId = await getRequiredUserId();
  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";

  if (!name) {
    redirect(`${COMPANIES_PATH}?error=empty`);
  }

  const existing = await prisma.company.findFirst({
    where: {
      userId,
      name: { equals: name, mode: "insensitive" },
    },
  });

  if (existing) {
    redirect(`${COMPANIES_PATH}?error=duplicate`);
  }

  try {
    await prisma.company.create({
      data: {
        name,
        userId,
      },
    });
  } catch (error) {
    console.error("Failed to add company:", error);
    redirect(`${COMPANIES_PATH}?error=failed`);
  }

  revalidateCompanyViews();
  redirect(COMPANIES_PATH);
}

export async function deleteCompany(companyId: string): Promise<void> {
  const userId = await getRequiredUserId();

  try {
    const result = await prisma.company.deleteMany({
      where: {
        id: companyId,
        userId,
      },
    });

    if (result.count === 0) {
      console.warn(`Company ${companyId} was not deleted (missing or forbidden).`);
      return;
    }

    revalidateCompanyViews();
  } catch (error) {
    console.error(`Failed to delete company ${companyId}:`, error);
  }
}

export interface CompanySearchActionResult {
  success: boolean;
  created: number;
  found: number;
  error?: string;
}

export async function searchNewsForCompany(
  companyId: string,
): Promise<CompanySearchActionResult> {
  const userId = await getRequiredUserId();

  try {
    const ownsCompany = await companyBelongsToUser(companyId, userId);

    if (!ownsCompany) {
      return {
        success: false,
        created: 0,
        found: 0,
        error: "Företaget hittades inte.",
      };
    }

    const job = await executeDiscoveryJob(companyId);
    const result = job.results[0];

    if (!result) {
      return {
        success: false,
        created: 0,
        found: 0,
        error: "Företaget hittades inte.",
      };
    }

    revalidateCompanyViews(companyId);

    return {
      success: true,
      created: result.created,
      found: result.found,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "COMPANY_NOT_FOUND") {
      return {
        success: false,
        created: 0,
        found: 0,
        error: "Företaget hittades inte.",
      };
    }

    if (error instanceof SearchServiceError) {
      return {
        success: false,
        created: 0,
        found: 0,
        error: error.message,
      };
    }

    console.error(`Failed to search news for company ${companyId}:`, error);

    return {
      success: false,
      created: 0,
      found: 0,
      error: "Sökningen misslyckades. Försök igen.",
    };
  }
}
