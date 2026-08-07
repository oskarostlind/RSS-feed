# Omvärldsbevakare

En bevakningstjänst för säljare och account managers. Du anger namnen på de
bolag du jobbar mot, och får ett mejl varje morgon när något av dem dyker upp i
nyheterna, pressen eller Platsbanken.

Det som gör tjänsten värd något är **täckningen av svensk lokal- och
branschpress**. De stora nyhets-API:erna indexerar bara riksmedia — en mätning
på Peges i Ljusdal AB gav noll träffar hos GNews trots ett förvärv som täcktes
av Dagens industri, Metal Supply, Svensk Verkstad och Ljusdals-Posten.

**`PROJECT.md` är den gemensamma kartan**: vad som byggs, vad som räknas som
klart, vilka brister som är kända och vilka risker som är billigare att veta om
nu. Läs den före koden. **`ARBETSLOGG.md`** är en löpande logg över vad de
automatiska körningarna gjort och vilka vägval de tagit.

## Så fungerar det

Ett cron-jobb kör `/api/cron/search` varje morgon. För varje bevakat bolag:

1. **Nyheter** hämtas från Google News RSS och Bing News RSS. Båda är publika
   flöden utan nyckel. GNews finns kvar som tredje källa men bidrar sällan.
2. **Jobbannonser** hämtas från Arbetsförmedlingens JobTech. Rekrytering
   avslöjar expansion före pressen.
3. Träffarna **filtreras och rankas**. Artiklar som namnger bolaget mejlas;
   artiklar som bara matchade sökningen hamnar i dashboarden för bedömning.
4. Ett **tidsfönster** avgör vad som mejlas. Allt sparas, men bara det som är
   färskt går ut — sökflödena är inte kronologiska och lämnar gärna ifrån sig
   en artikel från 2014.
5. **Källhälsan** bedöms utifrån körningen. En källa som svarar HTTP 200 med
   noll poster ser ut som "inga nyheter", så det larmas separat.

Bolag läggs till ett i taget eller genom att ladda upp en Excel- eller CSV-fil
på `/dashboard/companies/import`.

## Komma igång

```bash
npm install
cp .env.example .env      # fyll i värdena
npm run db:push           # lägger schemat på databasen
npm run dev
```

Kör testerna med `npm test`. De använder Nodes inbyggda testkörare och behöver
varken byggsteg eller databas.

## Miljövariabler

Utöver de som står i `.env.example` finns fyra som styr körningen och som alla
har rimliga standardvärden:

| Variabel | Standard | Vad den gör |
|---|---|---|
| `NEWS_WINDOW_DAYS` | `7` | Hur gammal en artikel får vara för att mejlas |
| `DISCOVERY_CONCURRENCY` | `5` | Hur många bolag som bearbetas samtidigt, tak 20 |
| `DISCOVERY_BUDGET_MS` | `45000` | När körningen slutar starta nya grupper |
| `MAX_COMPANIES_PER_USER` | uträknat | Portföljtak. Utan värde härleds det ur budget och parallellitet |
| `JOBTECH_ENABLED` | `true` | Sätt `false` för att stänga av jobbannonserna |

`DISCOVERY_CONCURRENCY` och portföljtaket hänger ihop: taket är hur många bolag
en körning hinner med, så höjd parallellitet höjer taket automatiskt.

## Diagnostik

Alla kräver `?secret=<CRON_SECRET>` och skriver aldrig till databasen.

| Endpoint | Vad den svarar på |
|---|---|
| `/api/debug/source-test?company=...` | Vad varje nyhetskälla hittar om ett bolag |
| `/api/debug/source-test?...&probe=1` | Vad källan *faktiskt svarade* — status, innehållstyp, början av kroppen. För när en källa ger noll utan att kasta fel |
| `/api/debug/jobtech-test?company=...` | Jobbannonser, både matchade och bortsorterade |
| `/api/debug/import-test` | Självtest av filläsningen i den miljö den körs i. Svarar 500 när något gått sönder |

## Att verifiera en ändring

Produktionen är den enda miljö där utgående nätverk fungerar som det ska, så
skarpa mätningar görs där.

**Rör ändringen morgonjobbet: kör `/api/cron/search` två gånger i rad.** Andra
körningen ska ge `created: 0` och `skipped` lika med antalet träffar. Annars
sparas artiklar om varje körning, och en artikel inom tidsfönstret mejlas varje
morgon i stället för en gång. Det var så Bings instabila `tid`-länkar upptäcktes
— en enda körning såg frisk ut.
