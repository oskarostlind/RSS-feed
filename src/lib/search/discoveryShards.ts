/**
 * Fan-out: att dela morgonkörningen över flera funktioner.
 *
 * **Varför taket inte går att höja på något annat sätt.** En Vercel-funktion
 * har 60 sekunder. Parallelliteten inuti körningen är redan utnyttjad —
 * bolagen körs i grupper — men gruppernas *antal* begränsas av samma 60
 * sekunder oavsett hur brett varje grupp går. `resolveDiscoveryCapacity` är
 * bara den siffran uttryckt i bolag: budgeten delat med tiden per grupp, gånger
 * parallelliteten. Med standardvärdena 110.
 *
 * 110 bolag räckte så länge tjänsten hade en användare. Med öppen registrering
 * är det ett tak för *alla tillsammans* — se `portfolioLimit.ts` — och tio
 * konton med tjugo bolag var spränger det. Det som händer då är inte ett fel
 * utan att bevakningarna tyst blir ett dygn gamla, vilket är precis det
 * tjänsten finns för att undvika.
 *
 * Vägen förbi är att låta körningen anropa sig själv: varje del får en egen
 * funktion med egna 60 sekunder, och de går samtidigt. Kapaciteten blir
 * antalet delar gånger vad en del hinner.
 *
 * **Priset, som PROJECT.md avsnitt 6 räknade upp och som fortfarande gäller:**
 * en självanropande nätverksväg som kan fallera, och en ny rutt som måste vara
 * skyddad. Det första hanteras genom att en del som inte svarar bara betyder
 * att dess bolag inte får sin markör flyttad — de kommer först i nästa körning
 * i stället för att sänka hela morgonen. Det andra genom att rutten kräver
 * samma `CRON_SECRET` som morgonjobbet.
 *
 * **Förvalet är en del, alltså exakt dagens beteende.** Med en del görs inget
 * nätverksanrop alls; körningen arbetar i sin egen funktion precis som förut.
 * Det är avsiktligt: den här commiten ska inte kunna ändra en morgon som
 * fungerar. `DISCOVERY_SHARDS` slår på det utan deploy, och `?shards=N` på
 * cron-rutten låter det mätas i produktion innan variabeln sätts.
 */

const DEFAULT_SHARDS = 1;

/**
 * Fyra delar är taket. Inte för att fler skulle vara tekniskt omöjligt, utan
 * för att varje del multiplicerar antalet samtidiga utgående anrop mot samma
 * källor. Fyra delar med parallellitet fem är redan tjugo bolag samtidigt mot
 * Google och Bing — och strypning där kostar oss täckning, vilket enligt
 * målbildens avsnitt 4 är det dyraste felet vi kan göra.
 */
const MAX_SHARDS = 4;

export function resolveShardCount(
  raw: string | undefined = process.env.DISCOVERY_SHARDS,
): number {
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SHARDS;
  }

  return Math.min(Math.floor(parsed), MAX_SHARDS);
}

/**
 * Delar upp bolagen i lika stora delar.
 *
 * **Varvat och inte i block.** Listan kommer sorterad äldst kontrollerad först,
 * så ett blockvis snitt skulle lägga alla mest eftersatta bolag i samma del —
 * och den delen är då den som har mest att göra och störst risk att slå i sin
 * egen tidsbudget. Varvningen ger varje del samma blandning, så att de blir
 * klara ungefär samtidigt. Det spelar roll eftersom samordnaren väntar på den
 * långsammaste.
 *
 * Tomma delar utelämnas: färre bolag än delar ska inte betyda anrop som inte
 * har något att göra.
 */
export function splitIntoShards<T>(items: readonly T[], shardCount: number): T[][] {
  const count = Math.max(Math.floor(shardCount), 1);

  if (count === 1) {
    return items.length > 0 ? [[...items]] : [];
  }

  const shards: T[][] = Array.from({ length: count }, () => []);

  items.forEach((item, index) => {
    shards[index % count].push(item);
  });

  return shards.filter((shard) => shard.length > 0);
}
