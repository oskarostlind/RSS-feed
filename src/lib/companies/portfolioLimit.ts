import {
  describePortfolioLimit,
  type PortfolioCapacity,
} from "@/lib/companies/portfolioCapacity";
import { prisma } from "@/lib/prisma";
import { resolveDiscoveryCapacity } from "@/lib/search/discoveryBudget";

/**
 * Tak för hur många bolag ett konto får bevaka.
 *
 * Skälet är inte databasstorlek — rader är billiga. Skälet är att varje bolag
 * kostar fyra utgående anrop **varje morgon, för alltid**, och att en portfölj
 * större än vad en körning hinner med betyder att bolag tyst hamnar utanför.
 * Markören i `lastCheckedAt` gör att de roterar in nästa dygn i stället för att
 * svälta, men en bevakning som kontrolleras var tredje dag är inte den produkt
 * som beskrivs i avsnitt 1.
 *
 * Själva talet räknas ut i `discoveryBudget`, eftersom det är en egenskap hos
 * körningen och inte hos portföljen.
 *
 * **Kapaciteten är delad, inte en kvot per konto.** Det här var fel fram till
 * 2026-08-08: taket räknades per användare, men talet det jämfördes mot är vad
 * *hela* morgonkörningen hinner med. Med en användare stämde det. Med tio
 * användare på tio bolag var var och en långt under sitt "tak" medan körningen
 * ändå bara hann med en del av dem — och konsekvensen syns inte som ett fel
 * utan som att bevakningen blir en dag gammal. Precis den sortens tystnad
 * tjänsten finns för att undvika.
 *
 * Därför räknas nu allas bolag mot samma budget. Det är hårt mot den som
 * registrerar sig sist, men det är sant, och ett tydligt "det finns inte plats"
 * är bättre än en bevakning som i smyg blir varannandags. Vägen ur det är
 * `DISCOVERY_CONCURRENCY`, eller fan-out — se PROJECT.md avsnitt 6.
 */

export type { PortfolioCapacity };
export { describePortfolioLimit };

export async function getPortfolioCapacity(
  userId: string,
): Promise<PortfolioCapacity> {
  const limit = resolveDiscoveryCapacity();

  // Två räkningar och inte en gruppering: `count` går på index och svarar på
  // konstant tid oavsett hur många användare som finns.
  const [used, total] = await Promise.all([
    prisma.company.count({ where: { userId } }),
    prisma.company.count(),
  ]);

  return {
    limit,
    used,
    usedByOthers: Math.max(total - used, 0),
    remaining: Math.max(limit - total, 0),
  };
}
