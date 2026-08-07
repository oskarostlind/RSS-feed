"use server";

import { redirect } from "next/navigation";
import { getRequiredUserId, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Radering av konto och all data — GDPR artikel 17.
 *
 * Kravet är inte bara att data *kan* raderas utan att användaren själv kan
 * göra det, utan att be någon. Avsnitt 7 i PROJECT.md pekar dessutom ut varför
 * det väger tyngre här än i en genomsnittlig tjänst: bevakningslistan avslöjar
 * vilka kunder en säljare jobbar mot, vilket är affärskänsligt även när det
 * inte är personuppgifter i lagens mening.
 *
 * Raderingen förlitar sig på kaskaderna i schemat. `User` kaskaderar till
 * `Company`, `Session` och `Account`, och `Company` vidare till `NewsItem`,
 * `JobAd` och `DiscoveredSource`. Det är kontrollerat i schemat och inte
 * antaget — varje relation har `onDelete: Cascade`.
 *
 * Att lita på kaskaden i stället för att radera tabell för tabell är ett val:
 * en handskriven raderingsordning glöms bort när en ny tabell läggs till, och
 * då blir kvarlämnad data en tyst bugg. Kaskaden följer med schemat.
 */
export async function deleteAccountAction(formData: FormData): Promise<void> {
  const userId = await getRequiredUserId();

  // Bekräftelsetexten är inte teater. Radering av konto går inte att ångra
  // och träffar allt på en gång; ett felklick ska inte räcka.
  const confirmation = formData.get("bekraftelse");

  if (typeof confirmation !== "string" || confirmation.trim() !== "RADERA") {
    redirect("/dashboard/konto?fel=bekraftelse");
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (error) {
    console.error(`Failed to delete account ${userId}:`, error);
    redirect("/dashboard/konto?fel=misslyckades");
  }

  // Sessionen ligger i databasen och är redan borta med kaskaden. Det här
  // rensar kakan, så att användaren inte möts av en session som pekar på ett
  // konto som inte finns.
  await signOut({ redirectTo: "/?raderat=1" });
}

/**
 * Slår morgonmejlet av eller på från kontosidan.
 *
 * Den här vägen kräver inloggning, till skillnad från länken i mejlet. Skälet
 * är att den går åt båda hållen: att *slå på* mejlet åt någon annan vore ett
 * sätt att använda tjänsten för att skicka post till en adress som bett att
 * slippa. Att stänga av är ofarligt och får därför gå utan session.
 */
export async function setMorningEmailAction(formData: FormData): Promise<void> {
  const userId = await getRequiredUserId();
  const enable = formData.get("aktivera") === "1";

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { morningEmailOptOutAt: enable ? null : new Date() },
    });
  } catch (error) {
    console.error(`Failed to change morning email setting for ${userId}:`, error);
    redirect("/dashboard/konto?fel=mejlinstallning");
  }

  redirect(`/dashboard/konto?mejl=${enable ? "pa" : "av"}`);
}

export interface AccountExport {
  exporterad: string;
  konto: { epost: string | null; skapadKonton: number };
  bolag: {
    namn: string;
    tillagd: string;
    nyheter: { rubrik: string; url: string; publicerad: string | null }[];
    jobbannonser: { rubrik: string; arbetsgivare: string; url: string }[];
  }[];
}

/**
 * Dataportabilitet — GDPR artikel 20. Allt tjänsten lagrar om användaren, i
 * ett format som går att läsa utan tillgång till databasen.
 *
 * Ligger bredvid raderingen med flit: den som funderar på att lämna vill oftast
 * ta med sig sin bevakningslista, och att bygga bara utvägen utan exporten gör
 * beslutet dyrare än det behöver vara.
 */
export async function exportAccountData(): Promise<AccountExport> {
  const userId = await getRequiredUserId();

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true,
      _count: { select: { accounts: true } },
      companies: {
        orderBy: { name: "asc" },
        select: {
          name: true,
          createdAt: true,
          newsItems: {
            orderBy: { publishedAt: "desc" },
            select: { title: true, url: true, publishedAt: true },
          },
          jobAds: {
            orderBy: { publishedAt: "desc" },
            select: { headline: true, employerName: true, url: true },
          },
        },
      },
    },
  });

  return {
    exporterad: new Date().toISOString(),
    konto: { epost: user.email, skapadKonton: user._count.accounts },
    bolag: user.companies.map((company) => ({
      namn: company.name,
      tillagd: company.createdAt.toISOString(),
      nyheter: company.newsItems.map((item) => ({
        rubrik: item.title,
        url: item.url,
        publicerad: item.publishedAt?.toISOString() ?? null,
      })),
      jobbannonser: company.jobAds.map((ad) => ({
        rubrik: ad.headline,
        arbetsgivare: ad.employerName,
        url: ad.url,
      })),
    })),
  };
}
