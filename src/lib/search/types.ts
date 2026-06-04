export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  publishedAt: Date | null;
}

export interface SearchServiceConfig {
  apiKey: string;
}

export interface GNewsArticle {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
}

export interface GNewsSearchResponse {
  totalArticles?: number;
  articles?: GNewsArticle[];
}
