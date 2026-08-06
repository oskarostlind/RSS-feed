import { significantNameTokens } from "@/lib/search/companyQuery";
import type { SearchHit } from "@/lib/search/types";

/**
 * Bolagsregister, katalogtjänster och sociala nätverk. De rankar högt på
 * bolagsnamn men innehåller aldrig nyheter — bara samma statiska bolagsdata
 * om och om igen.
 */
const BLOCKED_DOMAINS = [
  "allabolag.se",
  "bizzdo.se",
  "bolagsfakta.se",
  "bolagsverket.se",
  "companycheck.se",
  "facebook.com",
  "hitta.se",
  "indeed.com",
  "instagram.com",
  "largestcompanies.com",
  "linkedin.com",
  "merinfo.se",
  "nordicnet.se",
  "proff.se",
  "ratsit.se",
  "solidinfo.se",
  "x.com",
  "youtube.com",
] as const;

/**
 * Händelser som är affärsmässigt intressanta för en account manager.
 * Träffar här lyfts i mejlet — men saknad träff diskvalificerar inte.
 */
const SIGNAL_KEYWORDS = [
  "avtal",
  "beställning",
  "etablerar",
  "expanderar",
  "flyttar",
  "fusion",
  "förvärv",
  "förvärvar",
  "investerar",
  "investering",
  "konkurs",
  "köper",
  "leveransavtal",
  "nedskärning",
  "nyanställ",
  "nyemission",
  "order",
  "permittering",
  "rekonstruktion",
  "rekryterar",
  "satsar",
  "säljer",
  "tar över",
  "uppsägning",
  "utökar",
  "varsel",
  "vd",
  "växer",
  "ägarskifte",
  "övertar",
] as const;

export interface ScoredHit extends SearchHit {
  score: number;
  matchedKeywords: string[];
}

export interface RelevanceDecision {
  kept: ScoredHit[];
  rejected: Array<{ url: string; title: string; reason: string }>;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isBlockedDomain(url: string): boolean {
  const host = hostnameOf(url);

  if (!host) {
    return true;
  }

  return BLOCKED_DOMAINS.some(
    (blocked) => host === blocked || host.endsWith(`.${blocked}`),
  );
}

/**
 * Bolagets egen sajt är inte en oberoende nyhetskälla. Vi jämför mot
 * varumärkesledet: "peges" filtrerar bort peges.se men inte
 * verkstadstidningen.se.
 */
export function isCompanyOwnDomain(url: string, companyName: string): boolean {
  const host = hostnameOf(url);

  if (!host) {
    return false;
  }

  const label = host.split(".")[0];
  const tokens = significantNameTokens(companyName);

  return tokens.some((token) => token.length >= 4 && label === token);
}

function countKeywords(text: string): string[] {
  return SIGNAL_KEYWORDS.filter((keyword) => text.includes(keyword));
}

/**
 * En artikel räknas som en träff först när bolagsnamnet faktiskt förekommer i
 * rubrik eller ingress. RSS-sökningar returnerar gärna näraliggande men fel
 * bolag, och utan det här steget fylls mejlet med brus.
 */
export function scoreHit(
  hit: SearchHit,
  companyName: string,
): { ok: true; scored: ScoredHit } | { ok: false; reason: string } {
  if (isBlockedDomain(hit.url)) {
    return { ok: false, reason: "blocked-domain" };
  }

  if (isCompanyOwnDomain(hit.url, companyName)) {
    return { ok: false, reason: "company-own-domain" };
  }

  const title = hit.title.toLowerCase();
  const snippet = hit.snippet.toLowerCase();
  const haystack = `${title} ${snippet}`;
  const tokens = significantNameTokens(companyName);

  if (tokens.length === 0) {
    return { ok: false, reason: "no-usable-company-tokens" };
  }

  const matchedInTitle = tokens.filter((token) => title.includes(token));
  const matchedAnywhere = tokens.filter((token) => haystack.includes(token));

  // Varumärkesledet är alltid första token och måste alltid finnas med.
  if (!matchedAnywhere.includes(tokens[0])) {
    return { ok: false, reason: "company-name-absent" };
  }

  const matchedKeywords = countKeywords(haystack);
  const score =
    matchedAnywhere.length * 2 +
    matchedInTitle.length * 3 +
    matchedKeywords.length * 2 +
    (hit.publishedAt ? 1 : 0);

  return {
    ok: true,
    scored: { ...hit, score, matchedKeywords },
  };
}

export function filterAndRankHits(
  hits: SearchHit[],
  companyName: string,
): RelevanceDecision {
  const kept: ScoredHit[] = [];
  const rejected: RelevanceDecision["rejected"] = [];

  for (const hit of hits) {
    const result = scoreHit(hit, companyName);

    if (result.ok) {
      kept.push(result.scored);
    } else {
      rejected.push({ url: hit.url, title: hit.title, reason: result.reason });
    }
  }

  kept.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    const aTime = a.publishedAt?.getTime() ?? 0;
    const bTime = b.publishedAt?.getTime() ?? 0;
    return bTime - aTime;
  });

  return { kept, rejected };
}
