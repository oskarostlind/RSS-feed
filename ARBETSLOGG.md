# Arbetslogg

Vad de automatiska körningarna gjort, senast överst. Kort med flit — det här är
överblicken, inte dokumentationen. Den ligger i `PROJECT.md`.

## 2026-08-07 09:50

**Hälsa vid start:** Peges-förvärvet hittas. 15 träffar (google-rss 12,
bing-rss 3, gnews 0). Referensvärdet i uppdraget säger 17 — skillnaden ligger i
Bing, som svänger mellan körningar. Testfallet uppfyllt.

**Byggt:**

- `907d713` — jobbannonser från Platsbanken (§9.4). Egen modell `JobAd`,
  arbetsgivarspärr i `employerMatch.ts`, egen sektion i morgonmejlet,
  diagnostik på `/api/debug/jobtech-test`. Avstängbar med `JOBTECH_ENABLED=false`
- `6c6bc37` — rättning som min egen verifiering avslöjade: JobTech-frågan
  byggdes av hela det registrerade namnet, vilket gav `"Peges i Ljusdal"` och
  noll träffar per konstruktion. Söker nu på varumärkesledet
- `c985646` — parallell bearbetning och tidsbudget i morgonkörningen (§9.5).
  Grupper om fem, budget 45 av 60 sekunder, `Company.lastCheckedAt` som markör
  så att inget bolag svälter när budgeten inte räcker

**Mätning efter:** två bolag på 2,1 sekunder (var sekventiellt förut).
Körning ett: 9 nya artiklar, 6 nya jobbannonser, ett mejl skickat. Körning två
direkt efter: `created: 0` överallt, `skipped` lika med antalet träffar (15,
109, 6). Dedupliceringen håller för både artiklar och jobbannonser.

**Gissningar:**

- **Jobbannonser triggar mejl även när inga artiklar hittats.** Förut hoppades
  mejlet över när `createdNewsItems` var tomt. En morgon där bolaget lagt ut tre
  tjänster är en signal även när pressen är tyst, och §4 säger att en missad
  händelse väger tyngre. Alternativet — att bara komplettera befintliga mejl —
  hade gjort källan nästan osynlig. Ligger i `907d713`, revertbar
- **Namnkravet på jobbannonser är en spärr, inte en gradering** som i
  `relevance.ts`. En annons har alltid arbetsgivaren i eget fält, så det finns
  inget "Ljusdalsföretag"-problem att kompensera för. Kostnaden är att
  substrängmatchningen släpper igenom "Lennart Ericsson Fastigheter" på
  "Ericsson" — noterat i `PROJECT.md` §7
- **Parallellisering och budget före fan-out.** Fan-out höjer taket mer men
  kräver att tjänsten anropar sig själv över nätverket. Valde den enklare vägen
  för ett tak som ännu inte nåtts; inget i lösningen står i vägen för fan-out
  senare

**Blockerat:**

- **Registerhändelser (§9.3) kräver att du registrerar dig hos Bolagsverket.**
  PoIT:s sök-API svarar med WAF-avvisning på programmatiska anrop, och de öppna
  data-API:erna kräver klientkonto med nyckel. Koden runt omkring har redan
  mönstret från jobbannonserna att följa — det är bara nyckeln som saknas
- Verifierad mejldomän i Resend kräver DNS-åtkomst
- `AUTH_URL` i Vercel är fortfarande avklippt (`https://rss-feed-lime.vercel.`).
  Skyddsnätet i koden täcker just det felmönstret, men variabeln bör rättas
  eller tas bort — jag kan läsa miljövariabler, inte skriva dem
- En körning per dygn på Vercel Hobby. Bara Pro löser det

**Trasigt när jag slutade:** ingenting. Två cron-körningar i rad verifierade,
`prisma db push` rapporterar schemat i synk, `tsc --noEmit` rent.

**Testdata:** ingen skapad. De sex `JobAd`-raderna kom från den skarpa
körningen mot Ericsson och är riktiga annonser, inte påhitt — de lämnas kvar.

**Näst på tur:** larm när en källa tystnar (ny §9.6). En tyst nolla ser i dag ut
som "inga nyheter", och `?probe=` finns redan som byggsten.
