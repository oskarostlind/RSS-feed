"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const COMPANIES_PATH = "/dashboard/companies";

function revalidateCompanyViews(): void {
  revalidatePath(COMPANIES_PATH);
  revalidatePath("/dashboard");
}

export async function addCompany(formData: FormData): Promise<void> {
  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";

  if (!name) {
    redirect(`${COMPANIES_PATH}?error=empty`);
  }

  const existing = await prisma.company.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
    },
  });

  if (existing) {
    redirect(`${COMPANIES_PATH}?error=duplicate`);
  }

  try {
    await prisma.company.create({ data: { name } });
  } catch (error) {
    console.error("Failed to add company:", error);
    redirect(`${COMPANIES_PATH}?error=failed`);
  }

  revalidateCompanyViews();
  redirect(COMPANIES_PATH);
}

export async function deleteCompany(companyId: string): Promise<void> {
  try {
    await prisma.company.delete({
      where: { id: companyId },
    });
    revalidateCompanyViews();
  } catch (error) {
    console.error(`Failed to delete company ${companyId}:`, error);
  }
}
