"use server";

import { revalidatePath } from "next/cache";
import { NewsItemStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

async function updatePendingNewsItemStatus(
  newsItemId: string,
  status: typeof NewsItemStatus.CONFIRMED | typeof NewsItemStatus.REJECTED,
): Promise<void> {
  const updated = await prisma.newsItem.updateMany({
    where: {
      id: newsItemId,
      status: NewsItemStatus.PENDING,
    },
    data: { status },
  });

  if (updated.count === 0) {
    console.warn(
      `News item ${newsItemId} was not updated (missing or not pending).`,
    );
    return;
  }

  revalidatePath("/dashboard");
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
