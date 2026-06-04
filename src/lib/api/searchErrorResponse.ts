import type { SearchServiceError } from "@/lib/search/SearchService";

export interface SearchErrorResponseBody {
  error: string;
  details?: {
    httpStatus?: number;
  };
}

export function buildSearchErrorResponse(
  error: SearchServiceError,
): SearchErrorResponseBody {
  const body: SearchErrorResponseBody = { error: error.message };

  if (process.env.NODE_ENV !== "development") {
    return body;
  }

  if (error.httpStatus !== undefined) {
    body.details = { httpStatus: error.httpStatus };
  }

  return body;
}
