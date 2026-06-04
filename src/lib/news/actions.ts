"use server";

import { revalidatePath } from "next/cache";
import { NewsItemStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

function revalidateNewsViews(companyId: string): void {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/companies");
  revalidatePath(`/dashboard/companies/${companyId}`);
}

async function updatePendingNewsItemStatus(
  newsItemId: string,
  status: typeof NewsItemStatus.CONFIRMED | typeof NewsItemStatus.REJECTED,
): Promise<void> {
  const existing = await prisma.newsItem.findUnique({
    where: { id: newsItemId },
    select: { companyId: true, status: true },
  });

  if (!existing || existing.status !== NewsItemStatus.PENDING) {
    console.warn(
      `News item ${newsItemId} was not updated (missing or not pending).`,
    );
    return;
  }

  await prisma.newsItem.update({
    where: { id: newsItemId },
    data: { status },
  });

  revalidateNewsViews(existing.companyId);
}

export async function approveNewsItem(newsItemId: string): Promise<void> {
  try {
    await updatePendingNewsItemStatus(
      newsItemId,
      NewsItemStatus.CONFIRMED,
    );
  } catch (error) {
    console.error(`Failed to approve news item ${newsItemId}:`, error);
  }
}

export async function rejectNewsItem(newsItemId: string): Promise<void> {
  try {
    await updatePendingNewsItemStatus(newsItemId, NewsItemStatus.REJECTED);
  } catch (error) {
    console.error(`Failed to reject news item ${newsItemId}:`, error);
  }
}
