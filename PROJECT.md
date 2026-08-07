# Omvärldsbevakare — målbeskrivning

Detta dokument är den gemensamma kartan för projektet. Det beskriver vad vi
bygger, hur vi vet att vi lyckats, och vad som fortfarande är olöst. Uppdatera
det när målbilden ändras — inte när koden ändras.

Senast uppdaterad: 2026-08-07

---

## 1. Vad det är

En bevakningstjänst för säljare och account managers. Användaren anger namnet på
ett bolag hen jobbar mot och får ett mejl när bolaget dyker upp i nyheterna,
pressen eller offentliga register.

Det som gör tjänsten värd att betala för är **täckningen av svensk lokal- och
branschpress**. De stora nyhets-API:erna indexerar bara riksmedia. Mätning
2026-08-06 visade det svart på vitt: GNews gav noll träffar på Peges i Ljusdal,
trots ett förvärv i april som täcktes av Dagens industri, Metal Supply, Svensk
Verkstad och Ljusdals-Posten.

## 2. Vem det är för

En AM med en portfölj av kundbolag som hen behöver ha koll på — förvärv,
konkurser, expansioner, ägarbyten. Idag upptäcks sådant av en slump eller
för sent.

**Slutmålet är en produkt som säljs**, med öppen registrering och många
användare. Det påverkar varje arkitekturbeslut och är skälet till att avsnitt 6
och 7 finns.

## 3. Faser

**Fas 1 — fungerar för en användare.** Där vi är nu. Ingen öppen registrering.
Målet är att bevisa att täckningen håller och att morgonmejlet är värt att
öppna.

**Fas 2 — öppen registrering.** Vem som helst skapar konto och lägger egna
bevakningar. Kräver flerhyresgästmodell, kostnadstak per användare,
missbruksskydd, verifierad mejldomän och GDPR-hantering.

**Fas 3 — betalning.** Utanför nuvarande planering.

## 4. Så vet vi att vi lyckats

Fas 1 räknas som klar när samtliga stämmer:

1. En känd händelse hittas. Testfallet är Peges förvärv av Jonsson & Paulsson
   (2026-04-01). Hittas det inte är källorna fel, oavsett vad annat fungerar.
2. Morgonmejlet går ut kl 07 svensk tid utan manuell inblandning, sju dagar i
   rad.
3. Inga artiklar äldre än tidsfönstret når mejlet.
4. Minst tio bolag kan bevakas samtidigt inom funktionens tidsgräns.

### Vilket fel som väger tyngst

**Att missa en riktig nyhet är värre än att släppa igenom skräp.** En missad
konkurs hos en kund kostar mer än ett mejl med en irrelevant rad i.

Därför lutar vi åt täckning framför precision. Den tvågradiga modellen finns
kvar — säkra träffar i mejlet, osäkra i dashboarden — men gränsdragningen ska
vara generös, och tveksamma träffar ska hellre med än bort.

## 5. Vad som räknas som en händelse

| Typ | Källa | Status |
|---|---|---|
| Nyhetsartiklar | Google News RSS | **Byggt.** Täcker lokal- och branschpress |
| Pressmeddelanden | Cision, MyNewsdesk | Delvis — kommer med via Google News, egna flöden återstår |
| Registerhändelser | Bolagsverket, Post- och Inrikes Tidningar | **Blockerat.** Ingen öppen väg in — se avsnitt 7 |
| Jobbannonser | Arbetsförmedlingens JobTech (öppet API) | **Byggt 2026-08-07.** Egen modell `JobAd`, egen sektion i mejlet |

Registerhändelser och jobbannonser är strukturerad data, inte fritext. De
behöver egna datamodeller — dagens `NewsItem` med rubrik och länk passar dåligt
för "styrelseändring registrerad 2026-04-01". Jobbannonserna fick därför en
egen `JobAd` med yrke, ort och arbetsgivare som egna fält: det är de som gör en
annons till en expansionssignal, och de går inte att utläsa ur en rubrik.

### Så kommer bolagen in

Idag går det bara att lägga till ett bolag i taget via ett textfält. Med den
skala vi siktar på — över 100 bolag — är det ohållbart. En AM har redan sin
kundlista i Excel eller ett CRM och ska inte behöva knappa in den för hand.

**Massimport från fil** är **byggd 2026-08-07**, på
`/dashboard/companies/import`. Kravbilden nedan är uppfylld i sin helhet:

- Tar emot `.xlsx` och `.csv`. Excel är formatet en säljare faktiskt har.
- Låter användaren peka ut vilken kolumn som innehåller bolagsnamnet, i stället
  för att gissa. Filer från CRM har sällan en kolumn som heter "Företagsnamn".
- **Visar en förhandsgranskning innan något sparas.** Att importera 150 fel
  namn och sedan få bevakningar på alla är svårt att ångra.
- Flaggar dubbletter mot portföljen och inom filen.
- Normaliserar bolagsformer så att "Peges i Ljusdal AB" och "Peges i Ljusdal"
  inte blir två bevakningar.
- Rapporterar per rad vad som gick igenom och vad som hoppades över, med skäl.

Två saker att veta om implementationen:

**Excel-läsningen har inget bibliotek bakom sig.** `unzip.ts` är en minimal
zip-läsare på åttio rader, och `parseXlsx.ts` en delmängd av OOXML — sheet,
delade strängar, inline-strängar. Skälet är att `node_modules` är byggt för
Windows, så ett `npm install` från en Linux-miljö skriver in inkompatibla
binärer i samma träd. Delmängden räcker eftersom filerna alltid är skrivna av
Excel eller ett exportbibliotek. Verifieras i produktionsmiljön av
`/api/debug/import-test`, som kontrollerar mot förväntade värden och svarar 500
när något gått sönder.

**Taket är 500 bolag per import och 2 MB per fil.** Inte tekniskt utan
ekonomiskt — varje bolag är fyra utgående anrop varje morgon, för alltid. Det
är det första kostnadstak som faktiskt finns i tjänsten; se avsnitt 6.

## 6. Vad som måste byggas om innan fas 2

Detta är kända brister, inte spekulation.

~~**`NewsItem.url` är globalt unik.**~~ **Åtgärdat 2026-08-07.** Unikheten är
nu `@@unique([companyId, url])`, och dedupliceringen i `persistSearchHits`
filtrerar per bolag i stället för globalt. Rättningen gjordes samtidigt som
schemat lades på den nya databasen, medan tabellerna var tomma — mot en
databas med data hade samma ändring krävt att man först hittade och slog ihop
befintliga dubbletter.

~~**Cron-arkitekturen håller inte för över 100 bolag.**~~ **Delvis åtgärdat
2026-08-07.** Bolagen bearbetas nu i parallella grupper om fem
(`DISCOVERY_CONCURRENCY`, tak 20) i stället för ett i taget, med en tidsbudget
på 45 av 60 sekunder som avgör om ännu en grupp startas.
`Company.lastCheckedAt` gör budgeten rättvis: bolagen hämtas äldst kontrollerad
först, så hinner körningen bara halva portföljen tar nästa körning den andra
halvan i stället för att svälta samma bolag varje dygn. Körningen rapporterar
`companiesSkippedForTime` — ett tal över noll betyder att taket faktiskt nåtts.

Mätning 2026-08-07: två bolag på 2,1 sekunder, varav Ericsson med 109
RSS-träffar och 25 jobbannonser. Det räcker inte för att extrapolera till 100
bolag med säkerhet, men flaskhalsen är nätverksväntan och den parallelliseras
nu.

**Kvarstår:** taket är höjt, inte borttaget. Vid några hundra bolag krävs
fan-out till parallella funktioner — tjänsten anropar sig själv så att varje
delmängd får egna 60 sekunder. Det valdes bort nu därför att det lägger till en
självanropande nätverksväg och en ny säkerhetsyta för ett tak som ännu inte
nåtts. Vercel Hobbys *en körning per dygn* är fortfarande en separat gräns som
bara Pro löser.

Massimporten och kö-arkitekturen hänger fortfarande ihop, men mindre hårt än
förut: en Excel med 150 rader spräcker inte längre körningen, den fördelas över
flera dygn tills taket höjs.

**`AUTH_URL` i produktionsmiljön är felaktig.** Värdet är
`https://rss-feed-lime.vercel.` — en avklippt inklistring som tappat `app`.
Auth.js bygger både omdirigeringar och den magiska länken ur det, så
inloggningsmejlen pekade på en adress som inte finns. Koden kastar numera en
`AUTH_URL` vars värdnamn slutar med punkt och härleder adressen ur requesten i
stället, men **variabeln bör rättas eller tas bort i Vercel** — skyddsnätet
täcker just detta felmönster, inte alla.

Samma vända rättades en omdirigeringsloop: `pages.signIn` pekade på
`/api/auth/signin`, alltså Auth.js egen hanterare, som i sin tur skickar
tillbaka till `pages.signIn`. Hela appen var oåtkomlig — knapparna på
startsidan ledde ingenstans. Numera finns en egen sida på `/login`.

**Mejl går bara fram till kontoägaren, och hamnar utanför inkorgen även där.**
Avsändaren är `onboarding@resend.dev`, Resends delade sandlådedomän. Gratisnivån
levererar bara till kontots egen adress, så ingen annan kan få mejl alls.

Undersökt 2026-08-07 sedan inloggningen inte gick att använda. Kedjan var hel
hela vägen: Resend rapporterade `delivered` för varje inloggningsmejl, länkarna
pekade på rätt värdnamn, och en länk som klistrades in direkt loggade in utan
problem. **Mejlen nådde alltså fram men inte fram till läsaren** — de sorterades
undan, vilket är väntat för en avsändare som delas av varje gratisapp som aldrig
verifierat en domän.

Tre plåster lagda samma dag: avsändarnamn (`Omvärldsbevakare <...>`) så att
posten går att känna igen och söka på, textalternativ i alla utskick eftersom
HTML-bara mejl poängsätts som massutskick, och ett kvitto på
inloggningssidan som säger åt användaren att titta i skräpposten.

**Ingen av dem löser problemet.** Det gör bara en verifierad egen domän, och det
kräver DNS-åtkomst. Så länge det inte är gjort är inloggningen opålitlig för
alla utom den som vet var hen ska leta.

**Ingen kostnadskontroll per användare.** Med öppen registrering kan en
användare lägga in obegränsat många bolag.

**Åtgärdat 2026-08-07.** Två tak: 500 bolag per uppladdning och 2 MB per fil,
plus ett tak för hela portföljen som gäller oavsett hur bolagen kommit in.

Portföljtaket är **uträknat, inte valt**: tidsbudgeten delat med tiden per grupp,
gånger parallelliteten. Med standardvärdena blir det 110 bolag. Höjs
`DISCOVERY_CONCURRENCY` följer taket med automatiskt, vilket är meningen — den
som vill bevaka fler bolag ska först göra körningen snabbare, inte skriva upp en
siffra. `MAX_COMPANIES_PER_USER` går över uträkningen, med ett absolut tak på
1 000.

**Att taket landar på 110 är i sig ett besked.** Avsnitt 1 talar om "över 100
bolag", så standardinställningen ligger precis på gränsen för den produkt vi
säger oss bygga. En riktig portfölj kräver antingen högre parallellitet eller
fan-out.

**Schemat återställs inte av en deploy.** Fram till 2026-08-07 fanns ingen
`prisma/migrations`-katalog alls — tabellerna hade bara någonsin skapats med
`prisma db push` från en laptop. Och byggkommandot är `prisma generate && next
build`, som genererar klienten men aldrig rör databasen. Ingen deploy kunde
alltså återställa schemat, och ingen kunde se i repot vilket schema produktionen
faktiskt hade.

Det var inte teoretiskt: 2026-08-07 svarade `/api/cron/search` med 500 och
`P2021 — The table public.Company does not exist`. Orsaken var att
`DATABASE_URL` pekade på en nyuppsatt, tom Neon-databas som aldrig fått
schemat. Åtgärdat samma dag med `prisma db push` mot `neondb`, som då bara
innehöll en tom `_prisma_migrations`-tabell — ingen data gick förlorad.

**Halva grundproblemet är löst 2026-08-07.** Schemat har nu en
migrationshistorik: `prisma/migrations/0_init` är en baseline genererad ur
schemat och markerad som körd i produktionsdatabasen. Två saker följer av det —
schemat går att läsa ut ur repot, och en ny databas kan få samma schema utan att
någon minns vilka `db push` som gjordes när.

**Andra halvan återstår, och den är den som räknas.** Byggkommandot är
fortfarande `prisma generate && next build` och rör alltså aldrig databasen.
Nästa gång `DATABASE_URL` pekar på en tom databas händer exakt samma sak igen.
Ändringen är att lägga `prisma migrate deploy &&` först i byggkommandot;
baseline-migrationen var förutsättningen och finns nu.

Steget är medvetet inte taget automatiskt. Det ändrar vad **varje** deploy gör
mot produktionsdatabasen, och det beslutet bör fattas med öppna ögon.
`prisma/migrations/README.md` beskriver exakt vad som ska ändras.

## 7. Risker som är billigare att veta om nu

**Google News RSS är odokumenterat.** Det är gratis och fungerar utmärkt, men
det är ingen officiell produkt med serviceåtagande. Google kan strypa eller
ändra formatet utan förvarning. För ett personligt verktyg är det acceptabelt.
För en produkt någon betalar för är det en enskild felkälla utan reservplan.
Vi behöver minst en oberoende källa innan fas 2.

Risken är inte teoretisk. 2026-08-07 gav google-rss noll träffar på testfallet,
med HTTP 200 och utan fel — nio sekunders svarstid mot normala femtio
millisekunder. Nästa anrop gav de tolv förväntade träffarna igen. Bing-RSS
täckte upp och Peges-förvärvet nåddes ändå, vilket är precis varför två
oberoende källor finns.

**Det allvarliga är att en tyst nolla ser ut som "inga nyheter".** Händer det
kl 07 uteblir mejlet utan att någon får veta att bevakningen låg nere.

**Larm byggt 2026-08-07.** Hälsan härleds ur körningen som redan gjorts i
stället för att kosta egna anrop mot ett referensbolag — det mäter vad som
faktiskt hände för den riktiga portföljen, och kan inte själv gå sönder så att
larmet tystnar. `sourceHealth` i cron-svaret, och `console.error` för det som
ska väcka någon. Det krävde att `RssFeedService` behåller uppdelningen per
leverantör; sammanslagningen var precis det som dolde att en källa tystnat.

Den svåra delen var inte att larma utan att *inte* larma. En källa som ger noll
när ingen annan källa heller hittar något är en lugn dag. GNews och JobTech är
helt undantagna från tystnadslarm: GNews ger noll på svensk lokalpress som
normaltillstånd, och ett bolag som inte rekryterar ger noll annonser korrekt.
Logiken är tabelltestad i `sourceHealth.test.ts` — den går inte att verifiera
skarpt, eftersom en källa inte tystnar på beställning.

**GNews gratisnivå tål inte parallellisering.** Upptäckt samma dag, av det nya
larmet, i kod som skrivits en timme tidigare: fem bolag samtidigt är fem
samtidiga GNews-anrop, och svaret blev HTTP 429. Strypning har därför en egen
bedömning skild från haveri — en strypt källa lever, och åtgärden är att sänka
`DISCOVERY_CONCURRENCY`, inte att undersöka leverantörens drift.

Värt att överväga: **GNews bidrar nästan ingenting till det tjänsten är till
för.** På Peges — testfallet, ett lokalt industribolag — har den gett noll
träffar i varje mätning sedan 2026-08-06. På Ericsson gav den 11:10 samma dag
åtta träffar, men Ericsson är riksmedia och redan väl täckt av de två
RSS-källorna; samtliga åtta låg dessutom utanför tidsfönstret.

Bilden är alltså inte "GNews ger noll" utan "GNews ger träffar där vi redan har
täckning och noll där vi behöver den". Den kostar ett anrop per bolag och är den
enda källa som kan slå i en kvot. Att slå av den är fortfarande värt att
överväga, men beslutet bör grundas på en mätning över flera lokala bolag och
inte på testfallet ensamt.

**Länkarna går via Google.** Nya artikel-ID:n är krypterade, så publicistens
riktiga URL går inte att gräva fram. Länken fungerar för en läsare, men
dedupliceringen blir sämre och det ser mindre proffsigt ut i en säljbar produkt.

Gäller inte längre Bing. Där låg mål-URL:en i klartext i en `url`-parameter och
plockas nu ut. Det var inte bara kosmetika: Bings klickräknar-länkar har ett
`tid`-värde som är unikt per anrop, så samma artikel fick ny URL varje körning
och sparades om varje dygn — dedupliceringen var i praktiken satt ur spel för
Bing-träffar. Upptäcktes 2026-08-07 genom att köra morgonjobbet två gånger i
rad och jämföra `created` mot `skipped`. Den kontrollen är värd att göra om
efter varje ändring av en källa.

**Registerhändelser är stängda bakom registrering.** Provat 2026-08-07: Post-
och Inrikes Tidningars sök-API (`poit.bolagsverket.se`) svarar med en
WAF-avvisning ("Request Rejected") på programmatiska anrop, och Bolagsverkets
öppna data-API:er kräver ett registrerat klientkonto med API-nyckel. Ingen av
dem går att bygga vidare på utan att du registrerar dig som utvecklare hos
Bolagsverket. **Det är det enda som blockerar punkten** — koden runt omkring
har redan mönstret från jobbannonserna att följa.

**Jobbannonser matchas på substräng i arbetsgivarnamnet.** Fritextsökningen mot
JobTech träffar hela annonstexten, så spärren i `employerMatch.ts` kräver att
varumärkesledet finns i annonsens arbetsgivar- eller arbetsställefält. Den
sorterar bort bemanningsbolag som söker folk *till* bolaget — mätning
2026-08-07 på "Ericsson": 25 hittade, 6 matchade, 19 bortsorterade.

Men den släpper igenom bolag vars namn *innehåller* varumärket: "Lennart
Ericsson Fastigheter AB" matchade "Ericsson". Att kräva ordgräns i stället för
substräng skulle laga just det, men samtidigt missa koncernbolag som
"Pegesgruppen". Enligt avsnitt 4 väger täckning tyngre, så substräng står kvar
— men det är en känd falsk positiv, inte en förbisedd.

**Upphovsrätt vid vidareförmedling.** Att länka är fritt. Men EU:s
DSM-direktiv artikel 15 ger presspublicister en närstående rättighet till
utdrag ur artiklar, och den gäller i svensk rätt. Att i en **kommersiell**
tjänst systematiskt återge rubriker och ingresser från tidningar är inte
självklart tillåtet. Detta bör stämmas av med jurist innan fas 3 — inte för att
det nödvändigtvis är ett hinder, utan för att det är dyrt att upptäcka sent.
Jag är inte jurist och detta är ingen juridisk rådgivning.

**GDPR.** Vi lagrar mejladresser och bevakningslistor. Bevakningslistan avslöjar
vilka kunder en säljare jobbar mot, vilket kan vara affärskänsligt. Kräver
personuppgiftspolicy och rutin för radering innan öppen registrering.

## 8. Uttalade icke-mål

- Ingen sammanfattning eller analys av artiklar med språkmodell i fas 1
- Ingen mobilapp
- Inga andra språk än svenska
- Ingen bevakning av privatpersoner

## 9. Nästa steg

1. ~~Tidsfönster i cron-jobbet så att arkivartiklar inte mejlas~~ — **klart
   2026-08-07.** Sju dagar, styrbart via `NEWS_WINDOW_DAYS`. Fönstret gäller
   bara mejlet: allt sparas fortfarande, dels för dashboardens historik, dels
   för att dedupliceringen kräver att artikeln finns lagrad. Artiklar utan
   publiceringsdatum släpps igenom enligt avvägningen i avsnitt 4
2. ~~Rätta `NewsItem`-unikheten till `@@unique([companyId, url])`~~ — **klart
   2026-08-07**, se avsnitt 6
3. ~~Registerhändelser från Bolagsverket och Post- och Inrikes Tidningar~~ —
   **blockerad 2026-08-07.** Båda kräver registrering hos Bolagsverket, se
   avsnitt 7. Väntar på att du skaffar ett utvecklarkonto
4. ~~Jobbannonser via JobTech~~ — **klart 2026-08-07.** Egen modell `JobAd`,
   arbetsgivarspärr, egen sektion i mejlet, avstängbar med `JOBTECH_ENABLED`.
   Diagnostik på `/api/debug/jobtech-test`
5. ~~Kö-arkitektur för 100+ bolag~~ — **delvis klart 2026-08-07.**
   Parallellisering, tidsbudget och markör, se avsnitt 6. Fan-out återstår
6. ~~Larm när en källa tystnar~~ — **klart 2026-08-07.** Härlett ur körningen,
   tabelltestat, och mejlas till `ADMIN_EMAIL` vid `silent` eller `failing`.
   Se avsnitt 7
7. ~~Massimport av bolag från `.xlsx` och `.csv`~~ — **klart 2026-08-07**, se
   avsnitt 5. **Ej testad med en riktig uppladdning** — det kräver inloggning,
   vilket en automatisk körning inte kan göra. Parsningen är verifierad i
   produktionsmiljön via `/api/debug/import-test`, men själva formuläret har
   ingen människa provat
8. **Verifierad mejldomän i Resend — högsta prioritet av det som återstår.**
   Inloggningen är i praktiken trasig utan den: mejlen levereras men hamnar i
   skräpposten, se avsnitt 6. Kräver en egen domän och DNS-åtkomst
9. Mät GNews täckning över flera **lokala** bolag och slå av den om bilden
   håller. Noll träffar på Peges i varje mätning, men åtta på Ericsson — se
   avsnitt 7. Beslutet bör inte grundas på testfallet ensamt
10. ~~Kostnadstak per **användare**, inte bara per import~~ — **klart
    2026-08-07.** Portföljtak härlett ur körningens kapacitet, se avsnitt 6
