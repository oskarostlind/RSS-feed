import * as cheerio from "cheerio";
import type { SearchHit } from "@/lib/search/types";
import {
  buildScrapeKeywords,
  getScrapeArticleUrls,
  getScrapeTargetUrls,
} from "@/lib/search/scrapeConfig";

const LINK_SELECTORS = [
  "article a[href]",
  "h2 a[href]",
  "h3 a[href]",
] as const;

const SKIP_HREF_PREFIXES = ["#", "javascript:", "mailto:", "tel:"] as const;
const ARTICLE_PATH_PATTERN = /\/\d{4}-\d{2}-\d{2}\//;
const MAX_ARTICLE_PAGES_PER_TARGET = 25;

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

function textContainsKeyword(text: string, keywords: string[]): boolean {
  const lowerText = text.toLowerCase();
  return keywords.some((keyword) =>
    lowerText.includes(keyword.trim().toLowerCase()),
  );
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
  async scrapeForCompany(companyName: string): Promise<SearchHit[]> {
    const keywords = buildScrapeKeywords(companyName);
    const targetUrls = getScrapeTargetUrls(companyName);
    const articleUrls = getScrapeArticleUrls();

    if (targetUrls.length === 0 && articleUrls.length === 0) {
      return [];
    }

    const hits: SearchHit[] = [];
    const seenUrls = new Set<string>();

    const addHits = (newHits: SearchHit[]): void => {
      for (const hit of newHits) {
        if (seenUrls.has(hit.url)) {
          continue;
        }

        seenUrls.add(hit.url);
        hits.push(hit);
      }
    };

    for (const targetUrl of targetUrls) {
      for (const keyword of keywords) {
        try {
          const linkHits = await this.scrapeForKeyword(targetUrl, keyword);
          addHits(linkHits);
        } catch (error) {
          console.error(
            `Link scrape failed for ${targetUrl} (${keyword}):`,
            error,
          );
        }
      }

      try {
        const articleHits = await this.scrapeDiscoveredArticles(
          targetUrl,
          keywords,
        );
        addHits(articleHits);
      } catch (error) {
        console.error(`Article discovery failed for ${targetUrl}:`, error);
      }
    }

    for (const articleUrl of articleUrls) {
      try {
        const hit = await this.scrapeArticlePage(articleUrl, keywords);
        if (hit) {
          addHits([hit]);
        }
      } catch (error) {
        console.error(`Article scrape failed for ${articleUrl}:`, error);
      }
    }

    return hits;
  }

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
      const html = await this.fetchHtml(baseUrl);
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

  async scrapeDiscoveredArticles(
    targetUrl: string,
    keywords: string[],
  ): Promise<SearchHit[]> {
    const baseUrl = new URL(targetUrl).href;
    const html = await this.fetchHtml(baseUrl);
    const $ = cheerio.load(html);
    const articleUrls = this.discoverArticleUrls($, baseUrl).slice(
      0,
      MAX_ARTICLE_PAGES_PER_TARGET,
    );

    const hits: SearchHit[] = [];

    for (const articleUrl of articleUrls) {
      try {
        const hit = await this.scrapeArticlePage(articleUrl, keywords);
        if (hit) {
          hits.push(hit);
        }
      } catch (error) {
        console.error(`Failed to scrape article ${articleUrl}:`, error);
      }
    }

    return hits;
  }

  async scrapeArticlePage(
    url: string,
    keywords: string[],
  ): Promise<SearchHit | null> {
    const pageUrl = new URL(url).href;
    const html = await this.fetchHtml(pageUrl);
    const $ = cheerio.load(html);
    const bodyText = $("body").text();

    if (!textContainsKeyword(bodyText, keywords)) {
      return null;
    }

    const ogTitle = normalizeWhitespace(
      $('meta[property="og:title"]').attr("content") ?? "",
    );
    const articleHeading = normalizeWhitespace($("article h1").first().text());
    const pageHeading = normalizeWhitespace($("h1").last().text());
    const title = ogTitle || articleHeading || pageHeading;

    if (!title) {
      return null;
    }

    const ingress = normalizeWhitespace($("article p").first().text());
    const snippet =
      ingress && ingress.length > 0
        ? ingress.length > 400
          ? `${ingress.slice(0, 400)}…`
          : ingress
        : title;

    return {
      title,
      url: pageUrl,
      snippet,
      publishedAt: null,
    };
  }

  private discoverArticleUrls(
    $: cheerio.CheerioAPI,
    baseUrl: string,
  ): string[] {
    const origin = new URL(baseUrl).origin;
    const urls = new Set<string>();

    $("a[href]").each((_, element) => {
      const href = $(element).attr("href");

      if (!href || shouldSkipHref(href)) {
        return;
      }

      const absoluteUrl = resolveAbsoluteUrl(href, baseUrl);

      if (!absoluteUrl || !absoluteUrl.startsWith(origin)) {
        return;
      }

      const pathname = new URL(absoluteUrl).pathname;

      if (ARTICLE_PATH_PATTERN.test(pathname)) {
        urls.add(absoluteUrl);
      }
    });

    return [...urls];
  }

  private async fetchHtml(url: string): Promise<string> {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new ScraperServiceError(`Failed to fetch page (${response.status})`, {
        httpStatus: response.status,
      });
    }

    return response.text();
  }
}
