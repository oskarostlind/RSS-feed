/**
 * `\s+|^` och inte bara `\s+`: annars strippas inte bolagsformen när den är
 * hela namnet. En importrad med bara "AB" blev då en bevakning vars sökfråga
 * var `"AB"` — en fras som träffar i stort sett varje svensk artikel, varje
 * morgon, för alltid.
 */
const LEGAL_SUFFIX_PATTERN =
  /(\s+|^)(AB|HB|KB|AB\s*\(publ\)|Aktiebolag|Handelsbolag|Kommanditbolag)\s*$/gi;

/**
 * Ord som är för generiska för att ensamma bevisa att en artikel handlar om
 * bolaget. "Peges i Ljusdal AB" ska matcha på "Peges", inte på "i".
 */
const STOP_WORDS = new Set([
  "ab",
  "aktiebolag",
  "and",
  "för",
  "group",
  "handelsbolag",
  "hb",
  "i",
  "kb",
  "och",
  "the",
]);

export function stripLegalSuffix(companyName: string): string {
  return companyName.replace(LEGAL_SUFFIX_PATTERN, "").trim();
}

/**
 * Delar upp bolagsnamnet i ett varumärkesled och ett eventuellt ortsled.
 * "Peges i Ljusdal AB" → { brand: "Peges", location: "Ljusdal" }
 */
export function splitCompanyName(companyName: string): {
  brand: string;
  location: string | null;
} {
  const cleaned = stripLegalSuffix(companyName);
  const match = /^(.+?)\s+i\s+(.+)$/i.exec(cleaned);

  if (match) {
    return { brand: match[1].trim(), location: match[2].trim() };
  }

  return { brand: cleaned, location: null };
}

/**
 * Bygger flera sökfrågor per bolag. Ett exakt frasuttryck missar artiklar som
 * bara skriver "Peges", medan enbart varumärket drar in brus — därför körs
 * båda och träffarna slås ihop och filtreras i efterhand.
 */
export function buildQueryVariants(companyName: string): string[] {
  const cleaned = stripLegalSuffix(companyName);

  if (!cleaned) {
    return [];
  }

  const { brand, location } = splitCompanyName(companyName);
  const variants: string[] = [`"${cleaned}"`];

  if (location) {
    variants.push(`"${brand}" ${location}`);
  } else if (brand.includes(" ")) {
    variants.push(`"${brand}"`);
  }

  return [...new Set(variants)];
}

/**
 * De ord som måste kunna återfinnas i en artikel för att den ska räknas som
 * en träff på bolaget.
 */
export function significantNameTokens(companyName: string): string[] {
  return stripLegalSuffix(companyName)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}
