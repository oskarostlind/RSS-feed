import * as cheerio from "cheerio";
import type { SearchHit } from "@/lib/search/types";

const LINK_SELECTORS = [
  "article a[href]",
  "h2 a[href]",
  "h3 a[href]",
] as const;

const SKIP_HREF_PREFIXES = ["#", "javascript:", "mailto:", "tel:"] as const;

export class ScraperServiceError extends Error {
  readonly cause?: unknown;
  readonly httpStatus?: number;

  constructor(
    message: string,
    options?: { cause?: unknown; httpStatus?: number },
  ) {
    super(message);
    this.name = "ScraperServiceError";
    this.cause = options?.cause;
    this.httpStatus = options?.httpStatus;
  }
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function shouldSkipHref(href: string): boolean {
  const lower = href.trim().toLowerCase();
  return SKIP_HREF_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function resolveAbsoluteUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

function titleMatchesKeyword(title: string, keyword: string): boolean {
  return title.toLowerCase().includes(keyword.trim().toLowerCase());
}

function extractHitsFromPage(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  keyword: string,
): SearchHit[] {
  const hits: SearchHit[] = [];
  const seenUrls = new Set<string>();

  for (const selector of LINK_SELECTORS) {
    $(selector).each((_, element) => {
      const anchor = $(element);
      const href = anchor.attr("href");

      if (!href || shouldSkipHref(href)) {
        return;
      }

      const absoluteUrl = resolveAbsoluteUrl(href, baseUrl);

      if (!absoluteUrl || seenUrls.has(absoluteUrl)) {
        return;
      }

      const title = normalizeWhitespace(anchor.text());

      if (!title || !titleMatchesKeyword(title, keyword)) {
        return;
      }

      seenUrls.add(absoluteUrl);
      hits.push({
        title,
        url: absoluteUrl,
        snippet: title,
        publishedAt: null,
      });
    });
  }

  return hits;
}

export class ScraperService {
  async scrapeForKeyword(url: string, keyword: string): Promise<SearchHit[]> {
    const trimmedKeyword = keyword.trim();

    if (!trimmedKeyword) {
      throw new ScraperServiceError("Keyword must not be empty");
    }

    let baseUrl: string;

    try {
      baseUrl = new URL(url).href;
    } catch {
      throw new ScraperServiceError(`Invalid page URL: ${url}`);
    }

    try {
      const response = await fetch(baseUrl, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        throw new ScraperServiceError(
          `Failed to fetch page (${response.status})`,
          { httpStatus: response.status },
        );
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      return extractHitsFromPage($, baseUrl, trimmedKeyword);
    } catch (error) {
      if (error instanceof ScraperServiceError) {
        throw error;
      }

      throw new ScraperServiceError("Failed to scrape page for keyword", {
        cause: error,
      });
    }
  }
}
