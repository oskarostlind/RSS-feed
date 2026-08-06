export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  publishedAt: Date | null;
  /** Publicistens namn när källan uppger det, t.ex. "Verkstadstidningen". */
  sourceName?: string;
  /** Publicistens domän utan www, t.ex. "verkstadstidningen.se". */
  sourceDomain?: string;
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
