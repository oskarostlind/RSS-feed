import { significantNameTokens, splitCompanyName } from "@/lib/search/companyQuery";
import type { JobAdHit } from "@/lib/jobs/types";

/**
 * Matchning av arbetsgivarnamn.
 *
 * Här är avvägningen en annan än för nyheter. I `relevance.ts` sänker ett
 * saknat namn bara träffen till `low` — en lokaltidning som skriver
 * "Ljusdalsföretag" är ändå värd att visa. En jobbannons har inget motsvarande
 * omskrivningsproblem: arbetsgivaren står alltid utskriven i ett eget fält.
 *
 * Fritextsökningen träffar däremot hela annonstexten, så "Peges" fångar även
 * annonser från bemanningsbolag som söker folk *till* Peges, eller från
 * konkurrenter som nämner dem. De är inte signaler om att Peges expanderar.
 * Därför är namnkravet mot arbetsgivarfälten en **spärr** här, inte en
 * gradering.
 */

/**
 * Arbetsförmedlingen registrerar bolagsformen inkonsekvent: "KOMMANDITBOLAGET
 * JEM & FIX" i ett fält, "Kommanditbolaget jem& fix" i ett annat. Normalisera
 * bort skiftläge, bolagsform och skiljetecken innan jämförelsen.
 */
function normalizeEmployerName(value: string): string {
  return value
    .toLowerCase()
    .replace(
      /\b(aktiebolaget|aktiebolag|kommanditbolaget|kommanditbolag|handelsbolaget|handelsbolag|ab|hb|kb|publ)\b/g,
      " ",
    )
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Kräver att varumärkesledet finns i arbetsgivar- eller arbetsställenamnet.
 *
 * Ortsledet ("i Ljusdal") räknas inte: bolaget kan rekrytera till ett nytt
 * kontor på annan ort, och det är just den sortens händelse tjänsten finns
 * för att fånga.
 */
export function matchesEmployer(hit: JobAdHit, companyName: string): boolean {
  const { brand } = splitCompanyName(companyName);
  const brandTokens = significantNameTokens(brand);

  if (brandTokens.length === 0) {
    return false;
  }

  const haystack = normalizeEmployerName(
    [hit.employerName, hit.workplaceName].filter(Boolean).join(" "),
  );

  if (!haystack) {
    return false;
  }

  // Alla varumärkestoken måste finnas. "Nordic Steel" ska inte matcha varje
  // arbetsgivare som råkar heta något med "Nordic".
  return brandTokens.every((token) => haystack.includes(token));
}

export function filterJobAdsByEmployer(
  hits: JobAdHit[],
  companyName: string,
): { matched: JobAdHit[]; rejected: JobAdHit[] } {
  const matched: JobAdHit[] = [];
  const rejected: JobAdHit[] = [];

  for (const hit of hits) {
    if (matchesEmployer(hit, companyName)) {
      matched.push(hit);
    } else {
      rejected.push(hit);
    }
  }

  return { matched, rejected };
}
