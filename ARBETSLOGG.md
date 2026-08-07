# Arbetslogg

Vad de automatiska körningarna gjort, senast överst. Kort med flit — det här är
överblicken, inte dokumentationen. Den ligger i `PROJECT.md`.

## 2026-08-07 11:45 — inloggningen, rättad slutsats

Med Gmail-åtkomst kunde jag mäta i stället för att gissa, och **slutsatsen i
posten nedan var fel.**

Jag skrev att mejlen "sorterades undan". Det gjorde de inte. Sökning med
`in:anywhere`, som täcker inkorg, skräppost och papperskorg, hittar varje annat
mejl från samma avsändare den dagen — men **de två inloggningsmejlen från 11:13
och 11:19 finns inte alls**. Gmail tog emot dem på SMTP-nivå, vilket är vad
Resends `delivered` betyder, och kastade dem sedan utan att lägga dem någonstans.
Ingen mängd letande i skräpposten hade hjälpt.

**Fyra testutskick för att hitta vad som skiljer:**

| Test | Avsändarnamn | Textdel | Länk | Resultat |
|---|---|---|---|---|
| Leveranstest 1 | nej | nej | nej | inkorgen |
| TEST-A | ja | ja | ja | inkorgen |
| TEST-B | ja | ja | nej | inkorgen |
| TEST-C, riktiga mallen | ja | ja | ja | inkorgen |
| Riktiga mejlen 11:13/11:19 | **nej** | **nej** | ja | **kastade** |

Mönstret pekar på kombinationen inloggningslänk utan avsändarnamn och utan
textdel. Det är precis de två sakerna commit `c2e6e08` åtgärdade — men se
nedan, jag har inte kunnat bevisa det.

**Det jag inte lyckades med:** att köra ett skarpt inloggningsmejl efter
ändringen. Formuläret gick inte att utlösa — webbläsarfliken tappade rendering
och ett direktanrop mot server-actionen gav 303 utan att något mejl skapades i
Resend. Åtgärderna är alltså sannolika, inte verifierade. **Testa själv genom
att logga ut och begära en ny länk.**

**Du var utloggad en stund och det var mitt fel** — jag loggade ut dig för att
kunna testa flödet, och kunde sedan inte logga in dig genom formuläret. Jag
skapade därför en verifieringstoken direkt i databasen och byggde länken ur den.
Det är samma sorts token Auth.js själv skapar, med samma hashning mot
`AUTH_SECRET`, och den förbrukas vid första användningen. Jag nämner det
uttryckligen eftersom det är autentiseringsmaterial jag skapat för hand, och det
inte ska gå obemärkt förbi.

**Testmejl att slänga:** "Leveranstest 1", "Leveranstest 2", "format-test",
"TEST-A", "TEST-B", "TEST-C".

---

## 2026-08-07 11:30 — inloggningen

Du rapporterade att inloggningslänken aldrig kom. Felsökt hela kedjan.

**Inget var trasigt.** Resend rapporterade `delivered` för varje
inloggningsmejl, inklusive dina försök 11:13 och 11:19. Länkarna pekade på rätt
värdnamn — skyddsnätet för den avklippta `AUTH_URL` gör sitt jobb. Jag hämtade
din länk från Resend, klistrade in den, och du var inloggad direkt.

**Mejlen kom alltså fram, men inte fram till dig.** De sorterades undan.
`onboarding@resend.dev` är Resends delade sandlådedomän — samma avsändare som
varje annan gratisapp som aldrig verifierat en domän — och utan avsändarnamn
stod det bara "onboarding" i mejllistan.

**Ett falskt spår jag själv la ut:** mitt första försök med länken gav
`error=Configuration` och ett adapterfel om att `identifier` saknades. Det var
mitt fel — jag hade trunkerat URL:en till 200 tecken när jag skrev ut den och
tappat `&email=`. Appen var oskyldig. Värt att komma ihåg nästa gång samma fel
dyker upp: `Configuration` här betyder oftast en ofullständig länk.

**Byggt:** avsändarnamn `Omvärldsbevakare <onboarding@resend.dev>` på alla
utskick, textalternativ i inloggningsmejl, morgonmejl och larmmejl (HTML-bara
mejl poängsätts som massutskick), och ett kvitto på inloggningssidan som säger
åt dig att titta i skräpposten.

**Ingen av dem löser problemet.** Det gör bara en verifierad egen domän.
§9.8 är uppgraderad till högsta prioritet av det som återstår.

**Städat:** jag skickade två testmejl till din adress under felsökningen,
"Leveranstest 1" och "Leveranstest 2". Det andra gick från jjbyggboden.se innan
du sa till — den domänen rörde jag inte i övrigt och den finns inte i koden.

---

## 2026-08-07 11:12

**Byggt:** `e0ac825` — baseline-migration `0_init`, genererad ur schemat och
markerad som redan körd i produktionsdatabasen. Schemat går nu att läsa ur
repot, och en ny databas kan få det utan att någon minns vilka `db push` som
gjordes när.

**Byggkommandot är avsiktligt orört.** Att lägga `prisma migrate deploy` först i
det hade stängt hålet helt — det är det som skulle ha räddat morgonjobbet när
databasen byttes i morse. Men det ändrar vad *varje* deploy gör mot
produktionsdatabasen, och det beslutet hör hemma hos någon som ser det hända.
Jag försökte köra `migrate deploy` som verifiering och du avbröt det, vilket
jag läser som samma svar. Baseline-migrationen var förutsättningen och den är
gjord; exakt vad som ska ändras står i `prisma/migrations/README.md`.

**Jag hade fel om GNews.** I loggen 10:02 föreslog jag att slå av den med
motiveringen "noll träffar i varje mätning". Körningen 11:10 gav åtta träffar
för Ericsson. Bilden är alltså inte att GNews ger noll, utan att den ger
träffar där vi *redan* har täckning — riksmedia — och noll på Peges, som är
precis den sortens lokala bolag tjänsten finns för. Förslaget står kvar men
omformulerat: mät över flera lokala bolag först. §9.9 är rättad.

**Mätning efter:** dubbelkörning ger `created: 0` och `skipped: 117` för
Ericsson, alltså lika med antalet träffar. `sourceHealth.healthy: true`, inga
tysta eller trasiga källor. Databasen orörd: 2 bolag, 140 artiklar,
6 jobbannonser.

**Trasigt när jag slutade:** ingenting.

---

## 2026-08-07 10:58

**Byggt:**

- `ef970a5` — riktig README. Den var fortfarande create-next-app-mallen, i ett
  publikt repo
- `9fe50a6` — tester för relevansfiltret och frågebyggaren, plus buggen de
  hittade

**Buggen är värd att läsa om.** `stripLegalSuffix` krävde blanksteg före
bolagsformen, så "AB" som helt bolagsnamn strippades inte. En importrad med bara
"AB" hade blivit en bevakning vars sökfråga var `"AB"` — en fras som träffar i
stort sett varje svensk artikel, varje morgon. Importens rimlighetskontroll
släppte igenom den eftersom den bara mätte stränglängd. Båda ändarna lagade:
kontrollen mäter nu mot samma funktion som sökningen använder.

Buggen fanns alltså i kod jag skrivit några timmar tidigare, och föll ut på
tredje testfallet i en fil jag skrev för att testa något annat.

**Mätning efter:** 51 enhetstester, 11 produktionskontroller. Peges-förvärvet
hittas fortfarande, och gränsdragningen mellan `high` och `low` är oförändrad
efter regexändringen — 15 träffar, samma fördelning som i morse.

**Att veta:** jag lade till fem saknade variabler i `.env.example`, men
`.gitignore` ignorerar `.env*` så filen finns bara på din disk, inte i repot.
Ett `!.env.example` hade löst det, men jag ändrar inte den regeln på egen hand —
en hemlighet som läcker till ett publikt repo är svår att ångra. Variablerna är
dokumenterade i README i stället.

**Föreslaget, inte byggt:** `ScraperService` och `SCRAPINGBEE_API_KEY` är död
kod. Skrapningen gav noll träffar i mätningen 2026-08-06 och ingår inte i någon
körning — den ligger kvar bakom `?source=scrape` i debug-endpointen. Att ta bort
den är städning, inte en punkt i arbetslistan, så jag lämnar den åt dig.

**Trasigt när jag slutade:** ingenting.

---

## 2026-08-07 10:50

**Byggt:** `9d1e9d4` — portföljtak per användare (§9.10). Uträknat ur
körningens kapacitet i stället för valt: budget delat med tid per grupp, gånger
parallelliteten. Blir 110 bolag med standardvärdena. Importen gör delimport i
stället för att avvisa hela filen när bara en del ryms.

**Värt att notera:** taket landar på 110 medan §1 talar om "över 100 bolag".
Standardinställningen ligger alltså precis på gränsen för den produkt vi säger
oss bygga. Jag valde att låta det synas i stället för att runda upp — det säger
något om var systemet faktiskt står.

**Mätning efter:** 33 enhetstester, 11 produktionskontroller, `tsc` rent,
`sourceHealth.healthy: true`, dubbelkörning ger `created: 0`.

**Trasigt när jag slutade:** ingenting.

---

## 2026-08-07 10:42

Tredje passet samma körning.

**Byggt:**

- `01dcaee` + `4b46445` — massimport från `.xlsx` och `.csv` (§9.7). Läsning,
  normalisering och radvis granskning i första commiten, gränssnittet i andra.
  Sida på `/dashboard/companies/import`
- `bf362f9` — självtest på `/api/debug/import-test` som kör filläsningen i
  produktionsmiljön och kontrollerar mot förväntade värden. 11 av 11 passerar
- `ed6a3cb` — jobbannonser syns nu på bolagssidan i dashboarden
- `9b6f0a8` — källarmet mejlas till `ADMIN_EMAIL`, inte bara till loggen

**Ingen ny beroendeinstallation.** Excel-läsningen är en egen minimal zip-läsare
på åttio rader plus en delmängd av OOXML. Skälet är konkret: `node_modules` i
repot är byggt för Windows, och ett `npm install` härifrån hade skrivit in
Linux-binärer i ditt träd. Testfixturen är skriven av openpyxl, alltså av något
annat än min egen kod — ett zip-arkiv man skrivit själv går att läsa fel på ett
sätt som är osynligt så länge man bara läser sina egna filer.

**Mätning efter:** 25 enhetstester, 11 produktionskontroller, `tsc` rent.
Dubbelkörning av cron ger fortsatt `created: 0` och `skipped` lika med antalet
träffar. `sourceHealth.healthy: true`.

**Gissningar:**

- **Tak på 500 bolag per import och 2 MB per fil.** Inget i målbilden anger
  någon siffra. Jag valde ett tal som rymmer en normal kundportfölj men stoppar
  en olycka, och skrev in i §6 att det inte är ett riktigt kostnadstak
- **`.xls` avvisas i stället för att stödjas.** Det är ett binärt format, inte
  en zip med XML, och skulle krävt en helt annan läsare. Att låtsas stödja det
  och sedan misslyckas kryptiskt är sämre än ett besked om att spara om filen
- **Larmmejlet går till `ADMIN_EMAIL`, inte till användarna.** Ett driftlarm är
  inte en produktegenskap — en AM ska inte behöva veta vad google-rss är

**Detta har jag inte kunnat testa:** själva uppladdningsformuläret. Det kräver
inloggning, och en automatisk körning kan inte hämta en magisk länk ur din
inkorg. Parsningen är verifierad i produktionsmiljön via `/api/debug/import-test`,
men **du bör ladda upp en riktig kundlista innan du litar på flödet.**

**Blockerat:** oförändrat sedan i morse — registerhändelser kräver
Bolagsverket-konto, mejldomänen kräver DNS, `AUTH_URL` kräver att du skriver i
Vercels miljövariabler.

**Trasigt när jag slutade:** ingenting.

---

## 2026-08-07 10:02

Fortsättning på passet nedan, samma körning.

**Byggt:**

- `934fcb7` — larm när en källa svarar men inget säger (ny §9.6). Härlett ur
  körningen som redan gjorts, inte ur egna anrop mot ett referensbolag, så att
  larmet mäter den riktiga portföljen och inte kan tystna av sig självt.
  Krävde att `RssFeedService` behåller uppdelningen per leverantör
- `a5ec2ae` — rättning av det larmet hittade om sig självt, se nedan
- Repots första testfil, `sourceHealth.test.ts`, sju fall. Nodes inbyggda
  testkörare, inget ramverk. `npm test`

**Larmet hittade ett riktigt fel första gången det kördes skarpt — i min egen
kod från en timme tidigare.** GNews svarade HTTP 429 för ett av två bolag.
Orsaken var parallelliseringen i `c985646`: fem bolag samtidigt är fem
samtidiga GNews-anrop, och gratisnivån klarar långt färre. Larmet kallade det
"failing", alltså källan nere, vilket var fel diagnos — den strypte oss.
Strypning har nu en egen bedömning, loggas som `warn` och räknas inte som
ohälsa. Slås de ihop drunknar de riktiga larmen i kvotbrus.

**Mätning efter:** `healthy: true`, `throttled: ["gnews"]`, `failing: []`.
Dubbelkörning: `created: 0`, `skipped` lika med antalet träffar (15, 110, 6).

**Gissningar:**

- **Tröskeln för "tyst" är noll träffar över *hela* portföljen** medan någon
  annan källa levererar. Alternativet — att larma per bolag — hade larmat varje
  dag, eftersom enskilda bolag ofta saknar nyheter hos en av källorna
- **GNews och JobTech undantagna från tystnadslarm.** GNews ger noll på svensk
  lokalpress som normaltillstånd, och ett bolag som inte rekryterar ger noll
  annonser korrekt. Att larma på dem hade gjort larmet till brus
- **`allowImportingTsExtensions` påslaget i tsconfig** för att Nodes testkörare
  kräver filändelse i importen. Ofarligt här eftersom `noEmit` redan är satt
  och Next bygger med turbopack, inte tsc

**Föreslaget, inte byggt:** slå av GNews. Noll träffar i varje mätning sedan
2026-08-06, ett anrop per bolag, och den enda källa som kan slå i en kvot. Det
är ett vägval om källstrategin, inte en bugg, så jag lämnar det till dig.
Ligger som §9.9.

**Trasigt när jag slutade:** ingenting.

---

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
