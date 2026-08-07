/**
 * "BC12" → kolumnindex 54. Kolumnbokstäverna är bas 26 utan nolla, vilket är
 * den vanliga fällan: A är 1 och inte 0, så Z följs av AA och inte av BA.
 *
 * Egen fil enbart för att den ska gå att enhetstesta utan att dra in cheerio
 * och resten av `parseXlsx`.
 */
export function columnIndexFromRef(reference: string): number {
  const letters = /^([A-Z]+)/.exec(reference.toUpperCase())?.[1];

  if (!letters) {
    return 0;
  }

  let index = 0;

  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }

  return index - 1;
}
