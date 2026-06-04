"use server";

import { revalidatePath } from "next/cache";
import { NewsItemStatus } from "@/generated/prisma/enums";
import { getRequiredUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function revalidateNewsViews(companyId: string): void {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/companies");
  revalidatePath(`/dashboard/companies/${companyId}`);
}

async function updatePendingNewsItemStatus(
  newsItemId: string,
  userId: string,
  status: typeof NewsItemStatus.CONFIRMED | typeof NewsItemStatus.REJECTED,
): Promise<void> {
  const existing = await prisma.newsItem.findFirst({
    where: {
      id: newsItemId,
      status: NewsItemStatus.PENDING,
      company: { userId },
    },
    select: { companyId: true },
  });

  if (!existing) {
    console.warn(
      `News item ${newsItemId} was not updated (missing, not pending, or forbidden).`,
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
    const userId = await getRequiredUserId();
    await updatePendingNewsItemStatus(
      newsItemId,
      userId,
      NewsItemStatus.CONFIRMED,
    );
  } catch (error) {
    console.error(`Failed to approve news item ${newsItemId}:`, error);
  }
}

export async function rejectNewsItem(newsItemId: string): Promise<void> {
  try {
    const userId = await getRequiredUserId();
    await updatePendingNewsItemStatus(
      newsItemId,
      userId,
      NewsItemStatus.REJECTED,
    );
  } catch (error) {
    console.error(`Failed to reject news item ${newsItemId}:`, error);
  }
}
