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
 */

export interface PortfolioCapacity {
  limit: number;
  used: number;
  remaining: number;
}

export async function getPortfolioCapacity(
  userId: string,
): Promise<PortfolioCapacity> {
  const limit = resolveDiscoveryCapacity();
  const used = await prisma.company.count({ where: { userId } });

  return { limit, used, remaining: Math.max(limit - used, 0) };
}

/**
 * Formulerad som en mening en användare kan agera på, inte som ett felnummer.
 * Den som slår i taket har oftast just laddat upp en fil och behöver veta vad
 * som gick fel och vad som går att göra åt det.
 */
export function describePortfolioLimit(capacity: PortfolioCapacity): string {
  return (
    `Portföljen rymmer ${capacity.limit} bolag och du bevakar redan ` +
    `${capacity.used}. Ta bort några bevakningar, eller höj ` +
    `DISCOVERY_CONCURRENCY så att morgonkörningen hinner med fler.`
  );
}
