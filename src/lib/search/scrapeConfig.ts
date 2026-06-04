const KEYWORD_PLACEHOLDER = "{keyword}";

export function buildScrapeKeywords(companyName: string): string[] {
  const trimmed = companyName.trim();
  const keywords = new Set<string>();

  if (trimmed) {
    keywords.add(trimmed);
  }

  const withoutAb = trimmed.replace(/\s+AB\s*$/i, "").trim();
  if (withoutAb) {
    keywords.add(withoutAb);
  }

  const withoutLocation = withoutAb
    .replace(/\s+i\s+[A-Za-zÅÄÖåäö\s]+$/i, "")
    .trim();
  if (withoutLocation && withoutLocation !== withoutAb) {
    keywords.add(withoutLocation);
  }

  const firstToken = trimmed.split(/\s+/)[0];
  if (firstToken && firstToken.length >= 3) {
    keywords.add(firstToken);
  }

  return [...keywords];
}

function parseCommaSeparatedUrls(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function getScrapeTargetUrls(companyName: string): string[] {
  const templates = parseCommaSeparatedUrls(process.env.SCRAPE_TARGET_URLS);
  const keywords = buildScrapeKeywords(companyName);
  const primaryKeyword = keywords[0] ?? companyName;
  const encodedKeyword = encodeURIComponent(primaryKeyword);

  return templates.map((template) =>
    template.replaceAll(KEYWORD_PLACEHOLDER, encodedKeyword),
  );
}

export function getScrapeArticleUrls(): string[] {
  return parseCommaSeparatedUrls(process.env.SCRAPE_ARTICLE_URLS);
}
