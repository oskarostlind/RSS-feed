import { significantNameTokens } from "@/lib/search/companyQuery";

/**
 * Normalisering av bolagsnamn inför import.
 *
 * Kravet i målbilden: "Peges i Ljusdal AB" och "Peges i Ljusdal" ska inte bli
 * två bevakningar. Det låter kosmetiskt men är det inte — två bevakningar av
 * samma bolag ger dubbla mejl om varje nyhet, eftersom dedupliceringen är
 * avgränsad per bolag och de två raderna är olika bolag i databasens mening.
 *
 * Normaliseringen används **bara för att jämföra**. Namnet som sparas är det
 * användaren skrev, eftersom det är det som visas i mejlet och för att
 * sökfrågorna redan hanterar bolagsformen på egen hand.
 */

/**
 * Osynliga tecken som följer med när någon klistrat in från en webbsida eller
 * ett PDF-utdrag. De ser ut som mellanslag men är det inte, vilket gör att
 * `trim()` lämnar dem kvar och att två till synes identiska namn får olika
 * nycklar.
 */
const INVISIBLE_SPACE = /[\u00A0\u2007\u202F\u200B\uFEFF]/g;

/**
 * Vanliga skräpvarianter från CRM-exporter: dubbla mellanslag, hårda
 * mellanslag från klippt och klistrat, citattecken runt hela namnet och
 * avslutande skiljetecken från en dåligt avslutad export.
 */
export function cleanImportedName(raw: string): string {
  // Ordningen spelar roll: citattecknen måste bort *efter* trimningen, annars
  // matchar inte ankarna när cellen har inledande blanksteg. Och mellanslagen
  // städas igen efteråt, eftersom citaten kan ha dolt dem.
  return raw
    .replace(INVISIBLE_SPACE, " ")
    .trim()
    .replace(/^["'«»]+|["'«»]+$/g, "")
    .replace(/[,;|]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Jämförelsenyckeln — vad två rader måste ha gemensamt för att räknas som
 * samma bolag.
 *
 * **Varför nyckeln byggs av `significantNameTokens` och inte av strängen.**
 * Den funktionen är redan sökningens definition av vad som betyder något i ett
 * bolagsnamn: bolagsform bort, stoppord bort, skiljetecken bort. Att låta
 * dubblettkontrollen använda en egen, snällare definition var precis det som
 * släppte igenom paren nedan — och varje sådant par är dubbla mejl varje
 * morgon om samma nyhet:
 *
 * - "Peges i Ljusdal" / "Peges Ljusdal" — `i` är ett stoppord
 * - "Pohjanen & Ström" / "Pohjanen och Ström" — `&` skrivs ut först
 * - "AB Volvo" / "Volvo AB" — bolagsformen räknas bort oavsett var den står
 *
 * Fallbacken finns för namn som "H&M" och "3M", där varje ord är för kort för
 * att räknas som betydelsebärande. Utan den blir nyckeln tom, och en tom nyckel
 * matchar allt annat tomt — två helt olika bolag hade blivit dubbletter av
 * varandra.
 */
export function companyMatchKey(name: string): string {
  const cleaned = cleanImportedName(name).replace(/&/g, " och ");
  const tokens = significantNameTokens(cleaned);

  if (tokens.length > 0) {
    return tokens.join(" ");
  }

  return cleaned.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Rader som ser ut som bolagsnamn men inte är det.
 *
 * Exporter innehåller ofta en summeringsrad sist, och en fil utan rubrikrad
 * gör att rubriken i sig blir en importerad "bevakning". Båda är lätta att
 * missa i en förhandsgranskning på 150 rader.
 */
const NOT_COMPANY_NAMES = new Set([
  "antal",
  "bolag",
  "bolagsnamn",
  "company",
  "customer",
  "företag",
  "företagsnamn",
  "klient",
  "kund",
  "kundnamn",
  "kundnummer",
  "leverantör",
  "name",
  "namn",
  "organisation",
  "summa",
  "total",
  "totalsumma",
  "totalt",
]);

export function looksLikeHeaderOrTotal(name: string): boolean {
  return NOT_COMPANY_NAMES.has(companyMatchKey(name));
}

/**
 * Varför en cell inte kan bli en bevakning.
 *
 * Skälet returneras i stället för ett ja/nej, eftersom "Ser inte ut som ett
 * bolagsnamn" är obrukbart som besked på rad 87 av 150. "Ser ut som en
 * e-postadress" talar om vad som hänt: kolumnvalet pekar på fel kolumn.
 */
export type NonCompanyReason =
  | "header"
  | "email"
  | "url"
  | "phone"
  | "orgnr"
  | "number"
  | "date"
  | "no-tokens";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL = /^(https?:\/\/|www\.)\S+$/i;
/** Svenskt organisationsnummer, med eller utan sekelprefix och bindestreck. */
const ORGNR = /^(16|18|19|20)?\d{6}[-–\s]?\d{4}$/;
const DATE = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})$/;
const ONLY_NUMERIC = /^[\d\s.,%+–-]+$/;
const PHONE_SHAPE = /^\+?[\d\s\-().–]{7,}$/;

/**
 * Cellerna som mest sannolikt hamnar här är inte slarv utan **fel kolumn**:
 * kundnummer, org.nr, e-post och telefon är precis vad som står bredvid namnet
 * i en CRM-export. Därför är den här listan också det som gör den automatiska
 * kolumngissningen möjlig — en kolumn full av e-postadresser kan aldrig vara
 * namnkolumnen.
 */
export function classifyNonCompanyValue(raw: string): NonCompanyReason | null {
  const name = cleanImportedName(raw);

  if (name.length === 0) {
    return "no-tokens";
  }

  if (looksLikeHeaderOrTotal(name)) {
    return "header";
  }

  if (EMAIL.test(name)) {
    return "email";
  }

  if (URL.test(name)) {
    return "url";
  }

  if (DATE.test(name)) {
    return "date";
  }

  const digits = name.replace(/\D/g, "");

  // Org.nr före telefon och siffror: alla tre är bara siffror, men bara det
  // första skälet talar om för användaren vilken kolumn hen råkat välja.
  if (ORGNR.test(name) && (digits.length === 10 || digits.length === 12)) {
    return "orgnr";
  }

  if (ONLY_NUMERIC.test(name)) {
    return digits.length >= 7 ? "phone" : "number";
  }

  if (PHONE_SHAPE.test(name) && digits.length >= 7) {
    return "phone";
  }

  /**
   * Sista kontrollen, och den enda som funnits sedan tidigare: namnet måste
   * innehålla minst ett ord sökningen kan använda. Ett namn som består enbart
   * av bolagsform och stoppord — "AB", "och", "i" — ger noll användbara token,
   * och en bevakning på ett sådant namn kan aldrig ge en meningsfull träff.
   * Den skulle bara kosta fyra nätverksanrop varje morgon.
   */
  if (significantNameTokens(name).length === 0) {
    // Ett enda undantag, och det är avsiktligt smalt: namn som "H&M" och "A&O"
    // består av initialer med ett och-tecken emellan. Varje del är för kort för
    // att räknas som betydelsebärande, men namnet är fullt sökbart.
    //
    // Undantaget kräver ett `&` just för att det inte ska svälja "AB" eller
    // "och" — de är också korta och tokenlösa, men en bevakning på dem söker
    // efter en fras som förekommer i varannan svensk artikel, varje morgon.
    const initialsWithAmpersand = /^\p{L}{1,3}\s*&\s*\p{L}{1,3}$/u;

    return initialsWithAmpersand.test(name) ? null : "no-tokens";
  }

  return null;
}

export function isPlausibleCompanyName(name: string): boolean {
  return classifyNonCompanyValue(name) === null;
}
