import type {
  GNewsArticle,
  GNewsSearchResponse,
  SearchHit,
  SearchServiceConfig,
} from "@/lib/search/types";

const GNEWS_SEARCH_BASE_URL = "https://gnews.io/api/v4/search";

export interface SearchServiceErrorOptions {
  cause?: unknown;
  httpStatus?: number;
}

export class SearchServiceError extends Error {
  readonly cause?: unknown;
  readonly httpStatus?: number;

  constructor(message: string, options?: SearchServiceErrorOptions) {
    super(message);
    this.name = "SearchServiceError";
    this.cause = options?.cause;
    this.httpStatus = options?.httpStatus;
  }
}

function parsePublishedAt(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function mapArticleToSearchHit(article: GNewsArticle): SearchHit {
  return {
    title: article.title,
    url: article.url,
    snippet: article.description,
    publishedAt: parsePublishedAt(article.publishedAt),
  };
}

function extractGNewsErrorMessage(body: string, httpStatus: number): string {
  try {
    const parsed = JSON.parse(body) as {
      message?: string;
      errors?: string[];
    };

    if (parsed.message) {
      return parsed.message;
    }

    if (parsed.errors?.length) {
      return parsed.errors.join("; ");
    }
  } catch {
    // Response body is not JSON — fall through to generic message.
  }

  const trimmed = body.trim();
  if (trimmed.length > 0 && trimmed.length <= 200) {
    return trimmed;
  }

  return `HTTP ${httpStatus}`;
}

export class SearchService {
  private readonly apiKey: string;

  constructor(config: SearchServiceConfig) {
    this.apiKey = config.apiKey;
  }

  static fromEnv(): SearchService {
    const apiKey = process.env.GNEWS_API_KEY;

    if (!apiKey) {
      throw new SearchServiceError(
        "Missing environment variable: GNEWS_API_KEY",
      );
    }

    return new SearchService({ apiKey });
  }

  async searchForCompany(companyName: string): Promise<SearchHit[]> {
    try {
      const url = this.buildRequestUrl(companyName);
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        const body = await response.text();
        const detail = extractGNewsErrorMessage(body, response.status);
        throw new SearchServiceError(
          `GNews search failed (${response.status}): ${detail}`,
          { httpStatus: response.status },
        );
      }

      const data = (await response.json()) as GNewsSearchResponse;

      if (!data.articles?.length) {
        return [];
      }

      return data.articles.map(mapArticleToSearchHit);
    } catch (error) {
      if (error instanceof SearchServiceError) {
        throw error;
      }

      throw new SearchServiceError("Failed to execute GNews search", {
        cause: error,
      });
    }
  }

  private buildRequestUrl(companyName: string): string {
    const params = new URLSearchParams({
      q: `"${companyName}"`,
      lang: "sv",
      country: "se",
      max: "10",
      apikey: this.apiKey,
    });

    return `${GNEWS_SEARCH_BASE_URL}?${params.toString()}`;
  }
}
