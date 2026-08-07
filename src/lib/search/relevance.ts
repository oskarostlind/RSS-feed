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
 * Kurssidor — instrumentsidor för en aktie, inte artiklar om bolaget.
 *
 * De kan inte blockeras på domän, eftersom sajterna nedan också publicerar
 * riktiga nyheter som vi vill ha. Skillnaden ligger i sökvägen: en artikel har
 * en rubrik i URL:en, en kurssida har instrumentets namn under `/equities/`,
 * `/quote/` eller motsvarande.
 *
 * Varför det spelar roll mer än en vanlig falsk positiv: en kurssida sätter
 * dagens datum varje dygn, så den ser alltid färsk ut och passerar
 * tidsfönstret för alltid. `Fagerhult AB (FAG)` från se.investing.com nådde
 * den **säkra** delen av morgonmejlet 2026-08-07.
 *
 * Detta står inte i konflikt med avvägningen i målbildens avsnitt 4 om att
 * hellre släppa igenom skräp än att missa en nyhet. En kurssida är inte en
 * tveksam nyhet — den är inte en nyhet alls.
 */
const QUOTE_PAGE_PATTERNS: readonly { domain: string; path: RegExp }[] = [
  { domain: "investing.com", path: /^\/(equities|indices|commodities)\// },
  { domain: "marketscreener.com", path: /^\/quote\// },
  { domain: "yahoo.com", path: /^\/quote\// },
  { domain: "avanza.se", path: /^\/aktier\// },
  { domain: "nordnet.se", path: /^\/(aktiekurser|marknaden)\// },
  { domain: "di.se", path: /^\/bors\// },
  { domain: "borsdata.se", path: /^\/(aktier|instrument)\// },
  { domain: "tradingview.com", path: /^\/symbols\// },
];

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

/**
 * `high` — bolagsnamnet står i rubrik eller ingress. Går rakt in i mejlet.
 * `low`  — namnet syns inte i rubriken, men sökningen krävde det i fulltexten.
 *          Lokaltidningar skriver ofta "Ljusdalsföretag" i stället för
 *          bolagsnamnet, så de här får inte slängas — de hamnar i dashboarden
 *          för manuell bedömning i stället för i mejlet.
 */
export type HitConfidence = "high" | "low";

export interface ScoredHit extends SearchHit {
  score: number;
  matchedKeywords: string[];
  confidence: HitConfidence;
}

export interface RelevanceDecision {
  /** Alla träffar som passerat hårda spärrar, rankade. */
  kept: ScoredHit[];
  /** Delmängd av kept med confidence "high" — det som mejlas. */
  highConfidence: ScoredHit[];
  /** Delmängd av kept med confidence "low" — enbart dashboarden. */
  lowConfidence: ScoredHit[];
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
 * Kurssida på en sajt som i övrigt publicerar nyheter. Se
 * `QUOTE_PAGE_PATTERNS` för varför sökvägen och inte domänen avgör.
 */
export function isQuotePage(url: string): boolean {
  const host = hostnameOf(url);

  if (!host) {
    return false;
  }

  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }

  return QUOTE_PAGE_PATTERNS.some(
    (pattern) =>
      (host === pattern.domain || host.endsWith(`.${pattern.domain}`)) &&
      pattern.path.test(path),
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
 * Hårda spärrar först, sedan poängsättning. Att bolagsnamnet saknas i texten
 * är medvetet *inte* en spärr — det sänker bara till confidence "low".
 *
 * Skälet: Google News `<description>` innehåller bara rubriken igen, så det
 * finns ingen brödtext att matcha mot. Ett strikt namnkrav slängde i test bort
 * fyra korrekta artiklar om Peges där lokalpressen skrev "Ljusdalsföretag".
 */
export function scoreHit(
  hit: SearchHit,
  companyName: string,
): { ok: true; scored: ScoredHit } | { ok: false; reason: string } {
  if (isBlockedDomain(hit.url)) {
    return { ok: false, reason: "blocked-domain" };
  }

  if (isQuotePage(hit.url)) {
    return { ok: false, reason: "quote-page" };
  }

  if (isCompanyOwnDomain(hit.url, companyName)) {
    return { ok: false, reason: "company-own-domain" };
  }

  const tokens = significantNameTokens(companyName);

  if (tokens.length === 0) {
    return { ok: false, reason: "no-usable-company-tokens" };
  }

  const title = hit.title.toLowerCase();
  const haystack = `${title} ${hit.snippet.toLowerCase()}`;

  const matchedInTitle = tokens.filter((token) => title.includes(token));
  const matchedAnywhere = tokens.filter((token) => haystack.includes(token));

  // Varumärkesledet är alltid första token.
  const namesTheCompany = matchedAnywhere.includes(tokens[0]);
  const matchedKeywords = countKeywords(haystack);

  const score =
    matchedAnywhere.length * 2 +
    matchedInTitle.length * 3 +
    matchedKeywords.length * 2 +
    (hit.publishedAt ? 1 : 0);

  return {
    ok: true,
    scored: {
      ...hit,
      score,
      matchedKeywords,
      confidence: namesTheCompany ? "high" : "low",
    },
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

  return {
    kept,
    highConfidence: kept.filter((hit) => hit.confidence === "high"),
    lowConfidence: kept.filter((hit) => hit.confidence === "low"),
    rejected,
  };
}
