import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { SearchHit } from "@/lib/search/types";

const GOOGLE_SEARCH_BASE_URL = "https://www.google.se/search";

const BLOCKED_DOMAINS = [
  "allabolag.se",
  "facebook.com",
  "hitta.se",
  "instagram.com",
  "linkedin.com",
  "merinfo.se",
  "ratsit.se",
] as const;

const ORGANIC_RESULT_SELECTORS = ["div.g", "div.MjjYud"] as const;

const SNIPPET_SELECTORS = [
  "div.VwiC3b",
  "div[data-sncf]",
  "span.st",
  "div.IsZvec",
  "div.lEBKkf",
] as const;

const SKIP_HREF_PREFIXES = ["#", "javascript:", "mailto:", "tel:"] as const;

export function buildGoogleSearchUrl(companyName: string): string {
  const trimmed = companyName.trim();

  if (!trimmed) {
    throw new Error("Company name must not be empty");
  }

  const params = new URLSearchParams({ q: trimmed });
  return `${GOOGLE_SEARCH_BASE_URL}?${params.toString()}`;
}

export function deriveCompanyDomainSlug(companyName: string): string | null {
  const trimmed = companyName.trim();

  if (!trimmed) {
    return null;
  }

  const withoutLegalSuffix = trimmed
    .replace(/\s+(AB|HB|KB|Aktiebolag)\s*$/i, "")
    .trim();
  const withoutLocation = withoutLegalSuffix
    .replace(/\s+i\s+[A-Za-zÅÄÖåäö\-]+(?:\s+[A-Za-zÅÄÖåäö\-]+)*\s*$/i, "")
    .trim();
  const baseName = withoutLocation || withoutLegalSuffix || trimmed;

  const slug = baseName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "");

  return slug.length >= 4 ? slug : null;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function shouldSkipHref(href: string): boolean {
  const lower = href.trim().toLowerCase();
  return SKIP_HREF_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function isBlockedHostname(
  hostname: string,
  companyDomainSlug: string | null,
): boolean {
  const host = normalizeHostname(hostname);

  for (const blockedDomain of BLOCKED_DOMAINS) {
    if (host === blockedDomain || host.endsWith(`.${blockedDomain}`)) {
      return true;
    }
  }

  if (companyDomainSlug) {
    const primaryLabel = host.split(".")[0] ?? "";
    if (primaryLabel === companyDomainSlug) {
      return true;
    }
  }

  return false;
}

function extractResultUrl(href: string): string | null {
  const trimmed = href.trim();

  if (!trimmed || shouldSkipHref(trimmed)) {
    return null;
  }

  if (trimmed.startsWith("/url")) {
    try {
      const parsed = new URL(trimmed, "https://www.google.com");
      const target =
        parsed.searchParams.get("q") ?? parsed.searchParams.get("url");

      if (target?.startsWith("http")) {
        return new URL(target).href;
      }
    } catch {
      return null;
    }
  }

  if (!trimmed.startsWith("http")) {
    return null;
  }

  try {
    return new URL(trimmed).href;
  } catch {
    return null;
  }
}

function findTitleAnchor(
  $: cheerio.CheerioAPI,
  container: cheerio.Cheerio<AnyNode>,
): cheerio.Cheerio<AnyNode> | null {
  const headingLink = container
    .find("a[href]")
    .filter((_, element) => {
      return $(element).find("h3").length > 0;
    })
    .first();

  if (headingLink.length > 0) {
    return headingLink;
  }

  const heading = container.find("h3").first();

  if (heading.length === 0) {
    return null;
  }

  const closestLink = heading.closest("a[href]");

  return closestLink.length > 0 ? closestLink : null;
}

function extractSnippet(
  $: cheerio.CheerioAPI,
  container: cheerio.Cheerio<AnyNode>,
  title: string,
): string {
  for (const selector of SNIPPET_SELECTORS) {
    const text = normalizeWhitespace(container.find(selector).first().text());

    if (text.length > 0) {
      return text;
    }
  }

  const fallbackParagraph = normalizeWhitespace(
    container.find("div").not("div div div").last().text(),
  );

  if (fallbackParagraph.length > 0 && fallbackParagraph !== title) {
    return fallbackParagraph;
  }

  return title;
}

function parseOrganicResult(
  $: cheerio.CheerioAPI,
  container: cheerio.Cheerio<AnyNode>,
  companyDomainSlug: string | null,
  seenUrls: Set<string>,
): SearchHit | null {
  const anchor = findTitleAnchor($, container);

  if (!anchor) {
    return null;
  }

  const href = anchor.attr("href");

  if (!href) {
    return null;
  }

  const url = extractResultUrl(href);

  if (!url || seenUrls.has(url)) {
    return null;
  }

  let hostname: string;

  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }

  if (isBlockedHostname(hostname, companyDomainSlug)) {
    return null;
  }

  const title = normalizeWhitespace(anchor.find("h3").first().text() || anchor.text());

  if (!title) {
    return null;
  }

  seenUrls.add(url);

  return {
    title,
    url,
    snippet: extractSnippet($, container, title),
    publishedAt: null,
  };
}

export function parseGoogleSearchResults(
  html: string,
  companyName: string,
): SearchHit[] {
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];
  const seenUrls = new Set<string>();
  const companyDomainSlug = deriveCompanyDomainSlug(companyName);

  for (const selector of ORGANIC_RESULT_SELECTORS) {
    $(selector).each((_, element) => {
      const hit = parseOrganicResult($, $(element), companyDomainSlug, seenUrls);

      if (hit) {
        hits.push(hit);
      }
    });
  }

  return hits;
}
