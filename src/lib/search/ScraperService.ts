import {
  buildGoogleSearchUrl,
  parseGoogleSearchResults,
} from "@/lib/search/googleSearch";
import type { SearchHit } from "@/lib/search/types";

const SCRAPINGBEE_API_URL = "https://app.scrapingbee.com/api/v1";

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

function extractScrapingBeeErrorMessage(body: string, httpStatus: number): string {
  try {
    const parsed = JSON.parse(body) as {
      message?: string;
      error?: string;
      reason?: string;
    };

    const message =
      parsed.message ?? parsed.error ?? parsed.reason ?? undefined;

    if (message) {
      return message;
    }
  } catch {
    // Response body is not JSON.
  }

  const trimmed = body.trim();
  if (trimmed.length > 0 && trimmed.length <= 200) {
    return trimmed;
  }

  return `HTTP ${httpStatus}`;
}

export class ScraperService {
  async scrapeForCompany(companyName: string): Promise<SearchHit[]> {
    const trimmed = companyName.trim();

    if (!trimmed) {
      return [];
    }

    let searchUrl: string;

    try {
      searchUrl = buildGoogleSearchUrl(trimmed);
    } catch (error) {
      console.error("ScraperService: Invalid company name for Google search:", error);
      return [];
    }

    try {
      const html = await this.fetchHtml(searchUrl, {
        renderJs: false,
        customGoogle: true,
      });
      return parseGoogleSearchResults(html, trimmed);
    } catch (error) {
      console.error(
        `ScraperService: Google scrape failed for "${trimmed}":`,
        error,
      );
      return [];
    }
  }

  private getScrapingBeeApiKey(): string {
    const apiKey = process.env.SCRAPINGBEE_API_KEY;

    if (!apiKey) {
      throw new ScraperServiceError(
        "Missing environment variable: SCRAPINGBEE_API_KEY",
      );
    }

    return apiKey;
  }

  private async fetchHtml(
    targetUrl: string,
    options: { renderJs: boolean; customGoogle: boolean },
  ): Promise<string> {
    const params = new URLSearchParams({
      api_key: this.getScrapingBeeApiKey(),
      url: targetUrl,
      render_js: options.renderJs ? "true" : "false",
      custom_google: options.customGoogle ? "true" : "false",
    });

    const scrapingBeeUrl = `${SCRAPINGBEE_API_URL}?${params.toString()}`;

    try {
      const response = await fetch(scrapingBeeUrl, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        const body = await response.text();
        const detail = extractScrapingBeeErrorMessage(body, response.status);
        throw new ScraperServiceError(
          `ScrapingBee request failed (${response.status}): ${detail}`,
          { httpStatus: response.status },
        );
      }

      return response.text();
    } catch (error) {
      if (error instanceof ScraperServiceError) {
        throw error;
      }

      throw new ScraperServiceError("Failed to fetch page via ScrapingBee", {
        cause: error,
      });
    }
  }
}
