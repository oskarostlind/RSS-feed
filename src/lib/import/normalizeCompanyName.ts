import {
  significantNameTokens,
  stripLegalSuffix,
} from "@/lib/search/companyQuery";

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
 * Vanliga skräpvarianter från CRM-exporter: dubbla mellanslag, hårda
 * mellanslag från klippt och klistrat, och citattecken runt hela namnet.
 */
export function cleanImportedName(raw: string): string {
  // Ordningen spelar roll: citattecknen måste bort *efter* trimningen, annars
  // matchar inte ankarna när cellen har inledande blanksteg. Och mellanslagen
  // städas igen efteråt, eftersom citaten kan ha dolt dem.
  return raw
    .replace(/ /g, " ")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Jämförelsenyckeln. Bolagsform, skiftläge och skiljetecken bort — det som
 * återstår är vad två rader måste ha gemensamt för att räknas som samma bolag.
 */
export function companyMatchKey(name: string): string {
  return stripLegalSuffix(cleanImportedName(name))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Rader som ser ut som bolagsnamn men inte är det.
 *
 * Exporter innehåller ofta en summeringsrad sist, och en fil utan rubrikrad
 * gör att rubriken i sig blir en importerad "bevakning". Båda är lätta att
 * missa i en förhandsgranskning på 150 rader.
 */
const NOT_COMPANY_NAMES = new Set([
  "bolag",
  "bolagsnamn",
  "customer",
  "företag",
  "företagsnamn",
  "kund",
  "kundnamn",
  "name",
  "namn",
  "summa",
  "total",
  "totalt",
]);

export function looksLikeHeaderOrTotal(name: string): boolean {
  return NOT_COMPANY_NAMES.has(companyMatchKey(name));
}

/**
 * Ett bolagsnamn måste innehålla minst ett ord som sökningen kan använda.
 *
 * Kravet ställs mot `significantNameTokens` och inte mot strängens längd, av
 * den enkla anledningen att det är den funktionen sökningen själv använder. Ett
 * namn som består enbart av bolagsform och stoppord — "AB", "och", "i" — ger
 * noll användbara token, och en bevakning på ett sådant namn kan aldrig ge en
 * meningsfull träff. Den skulle bara kosta fyra nätverksanrop varje morgon.
 *
 * Rena skiljetecken, ensamma bindestreck och "-" som platshållare för tomt
 * förekommer i exporter och fångas av samma villkor.
 */
export function isPlausibleCompanyName(name: string): boolean {
  return significantNameTokens(cleanImportedName(name)).length > 0;
}
