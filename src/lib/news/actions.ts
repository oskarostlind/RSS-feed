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

/**
 * Godkänner allt som ligger och väntar i inkorgen — "Läs alla".
 *
 * **Varför ids hämtas först i stället för ett enda `updateMany`.** Två skäl,
 * och båda hade bitit. Det ena är att revalideringen behöver veta *vilka*
 * bolagssidor som ändrats; ett `updateMany` returnerar bara ett antal, och då
 * hade bolagssidorna fortsatt visa gamla statusar tills cachen råkade gå ut.
 * Det andra är kapplöpningen: morgonens hämtning kan lägga in nya poster mitt
 * i klicket, och ett filter på `status: PENDING` hade svept med nyheter
 * användaren aldrig fick se. Genom att låsa listan till de id:n som fanns när
 * knappen trycktes godkänns bara det som faktiskt räknades på skärmen.
 */
export async function approveAllPendingNewsItems(): Promise<void> {
  try {
    const userId = await getRequiredUserId();

    const pending = await prisma.newsItem.findMany({
      where: {
        status: NewsItemStatus.PENDING,
        company: { userId },
      },
      select: { id: true, companyId: true },
    });

    if (pending.length === 0) {
      return;
    }

    await prisma.newsItem.updateMany({
      where: {
        id: { in: pending.map((item) => item.id) },
        // Kvar trots att id:na redan är filtrerade på användaren: mellan läsning
        // och skrivning kan posten ha hunnit bli ignorerad i en annan flik.
        status: NewsItemStatus.PENDING,
      },
      data: { status: NewsItemStatus.CONFIRMED },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/companies");
    for (const companyId of new Set(pending.map((item) => item.companyId))) {
      revalidatePath(`/dashboard/companies/${companyId}`);
    }
  } catch (error) {
    console.error("Failed to approve all pending news items:", error);
  }
}
