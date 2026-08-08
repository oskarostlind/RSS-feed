# Kundnytt — målbeskrivning

Detta dokument är den gemensamma kartan för projektet. Det beskriver vad vi
bygger, hur vi vet att vi lyckats, och vad som fortfarande är olöst. Uppdatera
det när målbilden ändras — inte när koden ändras.

Senast uppdaterad: 2026-08-08

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

Status 2026-08-07:

| Krav | Status |
|---|---|
| Flerhyresgästmodell | **Granskad, ingen läcka.** Samtliga Prisma-frågor utanför `generated/` är scopade på `userId`, direkt eller via `company: { userId }` |
| Kostnadstak per användare | **Byggt.** Portföljtak härlett ur körningens kapacitet, se avsnitt 6 |
| Missbruksskydd | **Byggt.** Tak för inloggningsmejl, se nedan |
| GDPR-hantering | **Byggt.** Radering, export och integritetspolicy |
| Verifierad mejldomän | **Byggt 2026-08-08.** Utskicken går via Strato-brevlådan `notiser@kundnytt.se` över SMTP, med SPF publicerad. Brevo valdes bort — se `DOMAN-CHECKLISTA.md`. **Väntar på en bekräftelse att mejlet landade i inkorgen**, se avsnitt 6 |

**Öppen registrering kan byggas färdig utan mejldomänen, men inte släppas utan
den.** Nya användare loggar in med magisk länk. Utan verifierad domän hamnar
den i skräpposten eller kastas — se avsnitt 6 — och då kan ingen ny användare
komma in över huvud taget. Det är inte en detalj att lösa sist; det är
förutsättningen för att fas 2 ska betyda något.

**Missbruksskydd på inloggningen.** Utan tak är formuläret två saker på en
gång: ett sätt att spamma en tredje part som aldrig bett om något, och ett sätt
att bränna mejlkvoten så att riktiga användare inte kan logga in. Två tak
gäller: fem per adress och timme, hundra totalt per timme.

Taket per adress svarar med **samma kvitto som vid framgång**. Den som spammar
någon annans adress ska inte få veta att spärren finns och börja rotera
adresser, och den som träffas legitimt har redan fått fem mejl den senaste
timmen. Det globala taket ger däremot ett ärligt felmeddelande — det är ett
driftläge, inte något användaren gjort.

**GDPR: radering och export.** `/dashboard/konto` visar räknat vad tjänsten
lagrar, låter användaren ladda ner allt som JSON (artikel 20) och radera kontot
med allt innehåll (artikel 17). Raderingen förlitar sig på kaskaderna i schemat
i stället för en handskriven raderingsordning, eftersom en sådan ordning glöms
bort när en tabell läggs till — och kvarlämnad persondata är då en tyst bugg.

**Integritetspolicyn** ligger på `/integritetspolicy` och är länkad från
inloggningssidan, där samtycket i praktiken ges. Den beskriver vad tjänsten
faktiskt gör — ändras behandlingen ska sidan ändras i samma commit.

### Mejlleveransen

Tjänsten heter **Kundnytt** sedan 2026-08-08 och domänen är
`kundnytt.se`.

Utskicken går genom `lib/email/transport.ts`, som väljer **SMTP när
`SMTP_HOST` är satt och Resend annars**. Leverantören är därmed konfiguration,
inte ett beroende i koden. Skälet till bytet var konkret: Resends gratisnivå
tillåter en verifierad domän, och den platsen är upptagen av ett annat projekt
som ska ligga kvar.

En **halv** SMTP-konfiguration behandlas som ingen alls och faller tillbaka på
Resend. Det är det farliga fallet — en halv konfiguration ser färdig ut och
fallerar först vid utskick, alltså kl 07 när ingen tittar.

`/api/debug/email-test` skickar ett riktigt mejl på begäran, och `?dry=1` visar
vilken väg som är vald utan att skicka något. Den finns därför att mejlvägen
annars bara går att prova när det råkar finnas en ny artikel.

Stegen som återstår är Oskars och står i `DOMAN-CHECKLISTA.md`.

**Avregistrering.** Morgonmejlet bär sedan 2026-08-08 en avregistreringslänk,
och `List-Unsubscribe`/`List-Unsubscribe-Post` så att Gmail och Outlook visar
sin egen knapp vid avsändarnamnet. Det är inte artighet utan leverans: utan väg
ut är "skräppost" den enda knapp mottagaren har, och varje sådan markering drar
ner avsändarryktet för *alla* användare. En tjänst som redan har leveransproblem
tål det sämst.

Länken bär sin egen behörighet — användar-id plus en HMAC över det, gjord med
`AUTH_SECRET`. **Den kräver med flit ingen inloggning:** att först behöva en
magisk länk som kanske hamnar i skräpposten vore att kräva att man löser
tjänstens kända problem innan man får slippa den. Signaturen ger inte
inloggning; det enda den öppnar är att stänga av mejlet, och det går att ångra
på `/dashboard/konto`.

Båda vägarna är POST — bekräftelsesidan `/avregistrera` och enklicks-API:t
`/api/avregistrera`. Skälet är konkret: mejlklienter och säkerhetsskannrar
förhämtar länkar, så en GET skulle stänga av mejlet för folk som aldrig
klickat.

Sökningen fortsätter för den som avregistrerat sig. Nyheterna ska fylla
dashboarden som vanligt; det är utskicket som upphör, inte bevakningen.

**Fas 3 — betalning.** Utanför nuvarande planering.

## 4. Så vet vi att vi lyckats

Fas 1 räknas som klar när samtliga stämmer:

1. En känd händelse hittas. Testfallet är Peges förvärv av Jonsson & Paulsson
   (2026-04-01). Hittas det inte är källorna fel, oavsett vad annat fungerar.
2. Morgonmejlet går ut kl 07 svensk tid utan manuell inblandning, sju dagar i
   rad.
3. Inga artiklar äldre än tidsfönstret når mejlet.
4. Minst tio bolag kan bevakas samtidigt inom funktionens tidsgräns.

### Status 2026-08-07 — tre av fyra

| # | Kriterium | Status | Bevis |
|---|---|---|---|
| 1 | Känd händelse hittas | **Uppfyllt** | Peges-förvärvet hittas i varje mätning, di.se 2026-04-01 |
| 2 | Mejl kl 07, sju dagar i rad | **Ej uppfyllt** | Se nedan — det enda som återstår |
| 3 | Inga artiklar äldre än fönstret | **Uppfyllt** | Körning med 12 bolag: 811 artiklar arkiverade, 3 mejlade |
| 4 | Tio bolag inom tidsgränsen | **Uppfyllt** | 12 bolag på 2,9 s av 45 s budget, `companiesSkippedForTime: 0` |

Kriterium 4 var tidigare en uträkning och inte en mätning. Det är nu mätt
skarpt: tolv riktiga svenska bolag lades in i portföljen, morgonjobbet kördes
två gånger, och testbolagen togs bort igen. 937 träffar, 935 överhoppade vid
andra körningen. **Marginalen är stor** — 2,9 av 45 sekunder betyder att
flaskhalsen inte är tiden per bolag utan Vercel Hobbys en körning per dygn.

**Varför kriterium 2 inte är uppfyllt, och varför det inte bara är en fråga om
att vänta sju dagar:**

- **Ingen historik finns.** Databasen byttes ut 2026-08-07 och innehåller bara
  data från den 6 augusti och framåt. Sju dygn i rad går inte att belägga för
  något som är yngre än sju dygn.
- **Klockslaget driver med sommartid.** `vercel.json` har `0 5 * * *`, och
  Vercels cron går på UTC. Det blir 07:00 svensk tid på sommaren men **06:00 på
  vintern**. Kravet säger kl 07 året om. Vercel har inget tidszonsstöd, och
  Hobby tillåter bara en körning per dygn, så det går inte att lösa med två
  scheman. Antingen accepteras en timmes drift halva året, eller så krävs Pro.
- **Mejlet når i praktiken bara kontoägaren.** Se avsnitt 6. Ett morgonmejl som
  bara fungerar för ett konto uppfyller inte kriteriet för en produkt.

Sammantaget: **fas 1 är inte klar, och fas 2 är inte nära.** Det som återstår i
fas 1 är inte kod utan drift — en verifierad mejldomän och sju dygns faktisk
körning. Se avsnitt 9.

### Vilket fel som väger tyngst

**Att missa en riktig nyhet är värre än att släppa igenom skräp.** En missad
konkurs hos en kund kostar mer än ett mejl med en irrelevant rad i.

Därför lutar vi åt täckning framför precision. Den tvågradiga modellen finns
kvar — säkra träffar i mejlet, osäkra i dashboarden — men gränsdragningen ska
vara generös, och tveksamma träffar ska hellre med än bort.

## 5. Vad som räknas som en händelse

| Typ | Källa | Status |
|---|---|---|
| Nyhetsartiklar | Google News RSS + Bing News RSS | **Byggt.** Täcker lokal- och branschpress. GNews avstängd 2026-08-07, se avsnitt 7 |
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

**Fan-out är byggd 2026-08-08.** Tjänsten kan anropa sig själv så att varje
delmängd bolag får egna 60 sekunder, och delarna går samtidigt. Kapaciteten blir
antalet delar gånger vad en del hinner — 110 med en del, 440 med fyra.

**Förvalet är en del, alltså oförändrat beteende.** Med en del görs inget
nätverksanrop alls. `DISCOVERY_SHARDS` slår på det utan deploy, och `?shards=N`
på cron-rutten kör en enskild körning delad utan att röra variabeln. Det senare
finns för att arkitekturen ska gå att mäta skarpt utan att slås på för alla
morgnar — att prova den kl 07 när ingen tittar vore fel ordning.

De två invändningar som gjorde att fan-out valdes bort tidigare står kvar, men
är hanterade. En del som inte svarar får inte sin markör flyttad, så dess bolag
ligger först i nästa körning i stället för att sänka morgonen; det rapporteras
som `shardsFailed`. Och delrutten kräver samma `CRON_SECRET` som morgonjobbet,
eftersom den startar exakt samma arbete.

Mätt 2026-08-08 med två delar: `shards: 2`, `shardsFailed: 0`, båda bolagen
sökta, källhälsan korrekt summerad över delarna och `created: 0 / skipped: 122`
i andra körningen. **Ännu inte mätt med en portfölj stor nog att kräva
delningen** — det som är bevisat är att vägen fungerar, inte att den håller vid
400 bolag.

**Kvar:** Vercel Hobbys *en körning per dygn* är en separat gräns som bara Pro
löser. Fan-out höjer hur många bolag en körning hinner med, inte hur ofta den
får köras.

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

Undersökt 2026-08-07 sedan inloggningen inte gick att använda. Koden var hel
hela vägen: Resend rapporterade `delivered` för varje inloggningsmejl, länkarna
pekade på rätt värdnamn, och en länk som klistrades in direkt loggade in utan
problem.

**Men mejlen finns inte i mottagarens Gmail.** Sökning med `in:anywhere` — som
täcker inkorg, skräppost och papperskorg — hittar varje annat mejl från samma
avsändare den dagen, men inte de två inloggningsmejlen. Gmail tog alltså emot
dem på SMTP-nivå, vilket är vad Resends `delivered` betyder, och kastade dem
sedan utan att lägga dem i någon mapp. Det är Gmails beteende för post den
bedömer som nätfiske, och en inloggningslänk från en delad sandlådedomän är
just det mönstret.

Kontrollerat mot fyra testutskick samma dag: mejl med samma avsändardomän, samma
HTML-mall och samma sorts inloggningslänk **kom fram** — så länge de hade
avsändarnamn och en textdel. De två som försvann saknade båda.

Tre åtgärder lagda: avsändarnamn (`Omvärldsbevakare <...>`), textalternativ i
alla utskick, och ett kvitto på inloggningssidan som säger åt användaren att
titta i skräpposten.

**Sandlådan är ersatt 2026-08-08.** Utskicken går numera över SMTP från
`notiser@kundnytt.se`, en riktig Strato-brevlåda på egen domän, med SPF
publicerad (`v=spf1 redirect=_spf.strato.com`). `/api/debug/email-test` svarar
`vag: smtp` och `verifieradDoman: true`, och ett skarpt utskick accepterades med
ett meddelande-id på `@kundnytt.se`.

**Och leveransen är bekräftad.** 2026-08-08 16:14 landade morgonsammanfattningen
i Gmails **Primär**-flik — inte i skräpposten, inte under Kampanjer. Det är
första gången tjänsten levererat till en inkorg från egen domän, och skillnaden
mot 2026-08-07 är hela poängen: då rapporterade Resend `delivered` för varje
inloggningsmejl medan Gmail kastade dem utan att lägga dem i någon mapp.
SMTP-accept är inte leverans, och det är därför den här punkten krävde ett öga
och inte ett API-svar.

**Kvar att prova:** ett skarpt *inloggningsmejl*. Morgonmejlet och
inloggningslänken har samma avsändare och samma transport, men det var
inloggningsmejlen specifikt som Gmail bedömde som nätfiske — en länk som loggar
in är precis det mönstret. Att morgonmejlet går fram är starkt stöd, inte
bevis.

**DMARC står på `p=reject`.** Det är Stratos standardregel, och den är
strängare än de `p=none` checklistan tidigare föreslog. Rätt så länge vi bara
skickar via Strato, eftersom SPF då stämmer. **Men den dagen utskicken flyttas
till en annan leverantör slutar all post komma fram i samma sekund**, inte
gradvis — SPF måste uppdateras i samma vända som `SMTP_HOST`. Det är den
enskilt lättaste vägen att sänka tjänsten tyst.

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

**Taket räknades per användare men gäller alla — rättat 2026-08-08.** Talet 110
är vad *hela* morgonkörningen hinner med, men jämfördes mot användarens egna
bolag. Med en användare stämde det, och det är därför felet aldrig syntes. Med
tio användare på tjugo bolag hade var och en legat långt under sitt "tak" medan
körningen ändå bara hunnit med hälften av dem.

Det allvarliga är hur felet hade visat sig: inte som ett fel, utan som att
`lastCheckedAt` roterar och varje bevakning tyst blir en dag gammal. En tjänst
vars hela löfte är att man får veta i tid hade alltså börjat leverera i
efterhand, utan att något larm gått. Det var den enskilt farligaste följden av
en bred lansering.

Nu räknas allas bolag mot samma budget, och beskedet skiljer på om det är du
själv eller andra konton som fyllt den — att be någon ta bort sina egna
bevakningar när det är andra som tagit plats är ett råd som inte hjälper.
**Konsekvensen är att tjänsten nu kan bli "full" på riktigt vid 110 bolag
totalt.** Det är avsiktligt: en ärlig gräns är bättre än en tyst
kvalitetsförsämring. Men det betyder också att kapaciteten måste höjas *innan*
en bred lansering, inte efter.

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

**Andra halvan är också gjord, 2026-08-07.** Byggkommandot är numera
`prisma migrate deploy && prisma generate && next build`. En ny eller
återställd databas får schemat automatiskt vid nästa deploy, och `P2021` kan
inte längre uppstå av att någon pekat om `DATABASE_URL`.

Kontrollerat före ändringen: `prisma migrate status` svarade "Database schema is
up to date" och `prisma migrate deploy` svarade "No pending migrations to apply"
mot produktionsdatabasen — alltså en no-op, även mot Neons pooler-endpoint.
Deployen efteråt gick till `READY`.

**Priset:** deployen beror nu på att databasen svarar. Är Neon nere misslyckas
bygget i stället för att gå igenom med en app som inte kan läsa något. Det är
avsiktligt — ett trasigt bygge syns, en tyst tom databas gör inte det — men en
databasincident blockerar numera också utrullningar. Backa genom att ta bort
`prisma migrate deploy && ` ur `build`.

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

~~**GNews gratisnivå tål inte parallellisering.**~~ **Avgjort 2026-08-07 —
GNews är avstängd som standard.** Strypningen visade sig hårdare än vi trott:
429 kom vid ungefär **ett anrop i sekunden**, alltså även när bolagen kördes
sekventiellt. Slutsatsen att sekventiell körning räcker var fel.

Strypning har fortfarande en egen bedömning skild från haveri — en strypt källa
lever — men den bedömningen gäller nu bara om någon slår på GNews igen.

**Mätningen som avgjorde det, över åtta bolag** med det nya verktyget
`/api/debug/source-coverage`:

| Bolagstyp | Bolag | GNews träffar | Unikt mejlbara |
|---|---|---|---|
| Lokala och medelstora | Peges, Gnosjö Automatsvarvning, Fläkt Woods, Hedin Bil, Norra Skog | 0 | **0** |
| Riksmedia | Ericsson, Volvo, Spotify | 24 | **2** |

"Unikt mejlbara" är måttet som betyder något: träffar som ingen annan källa
hittade **och** som är relevanta och inom tidsfönstret. Råa träffräkningar
överdriver — de flesta av GNews 24 fanns redan i RSS-källorna eller låg utanför
fönstret.

Att GNews svarade 8, 10 och 6 på riksmediebolagen är kontrollen som gör noll på
de lokala trovärdigt: det är källans besked, inte ett mätfel.

Två mejlbara artiklar på åtta bolag, båda på bolag av den typ tjänsten redan
täcker väl, väger inte upp ett utgående anrop per bolag varje morgon från den
enda källa som kan slå i en kvot. **Avstängd, inte borttagen** —
`GNEWS_ENABLED=true` sätter tillbaka den utan deploy, och mätverktyget finns
kvar för att ompröva beslutet. En avstängd källa utelämnas ur hälsorapporten i
stället för att rapporteras som tyst.

Kvar att veta: mätningen är en ögonblicksbild av åtta bolag en dag. Den säger
att GNews inte bidrar *nu*, inte att den aldrig kan göra det.

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

**Aktiekurssidor tar sig in i mejlet som nyheter.** Körningen med tolv bolag
2026-08-07 mejlade `Fagerhult AB (FAG)` från `se.investing.com` — en
kurssida, inte en artikel. Den nådde dessutom den **säkra** delen av mejlet,
inte "möjliga träffar".

Sådana sidor är värre än vanliga falska positiva: de sätter dagens datum varje
dygn, så de ser alltid färska ut och passerar tidsfönstret för alltid.
Dedupliceringen räddar oss från att mejla samma URL två gånger, men varje nytt
bolag med en kurssida ger en skräprad i första mejlet — och första intrycket är
det som avgör om någon fortsätter öppna mejlen.

Åtgärden är en spärrlista över domäner som inte är nyhetskällor
(`investing.com/equities`, aktiekurstjänster, bolagsregisterkataloger). Det är
inte i konflikt med avvägningen i avsnitt 4 om att hellre släppa igenom skräp:
en kurssida är inte en tveksam nyhet, den är inte en nyhet alls.

**Upphovsrätt vid vidareförmedling.** Att länka är fritt. Men EU:s
DSM-direktiv artikel 15 ger presspublicister en närstående rättighet till
utdrag ur artiklar, och den gäller i svensk rätt. Att i en **kommersiell**
tjänst systematiskt återge rubriker och ingresser från tidningar är inte
självklart tillåtet. Detta bör stämmas av med jurist innan fas 3 — inte för att
det nödvändigtvis är ett hinder, utan för att det är dyrt att upptäcka sent.
Jag är inte jurist och detta är ingen juridisk rådgivning.

**GDPR.** Vi lagrar mejladresser och bevakningslistor. Bevakningslistan avslöjar
vilka kunder en säljare jobbar mot, vilket kan vara affärskänsligt.

**Rutinen för radering och export är byggd 2026-08-07**, se avsnitt 3.
**Personuppgiftspolicyn återstår** och måste finnas innan någon annan än
kontoägaren skapar konto.

## 8. Uttalade icke-mål

- Ingen sammanfattning eller analys av artiklar med språkmodell i fas 1
- Ingen mobilapp
- Inga andra språk än svenska
- Ingen bevakning av privatpersoner

## 9. Nästa steg

### Vad som faktiskt står mellan oss och en bred lansering

Frågan ställdes 2026-08-08. Svaret är kortare än arbetslistan nedan, eftersom
det mesta på den kan göras efter lansering. Detta kan det inte.

| # | Hinder | Vem löser | Kan lanseras utan? |
|---|---|---|---|
| 1 | ~~Verifierad mejldomän (§9.8)~~ | **Klart 2026-08-08.** Leverans bekräftad | — |
| 2 | Kriterium 2 — sju dygn i rad (§4) | Tid. **Räkningen börjar 2026-08-08** | **Nej.** Fas 1 är inte belagd förrän det är mätt |
| 3 | ~~Kapaciteten räcker för fler än ett konto (§6)~~ | **Byggt 2026-08-08.** Fan-out, se §6 | Sätt `DISCOVERY_SHARDS` före lansering |
| 4 | Beslut om registreringsläge (§9.18) | Oskar | Nej, men det är ett beslut på fem sekunder |
| 5 | En källa som inte är Google eller Bing (§7) | Kod, blockerad av Bolagsverket | Ja, med risk |
| 6 | Upphovsrätt, DSM artikel 15 (§7) | Jurist | Ja om gratis, **nej om betalt** |
| 7 | ~~Byta mejladress i gränssnittet (§9.20)~~ | **Byggt 2026-08-08** | — |

**Punkt 3 var den som lättast förbisågs**, eftersom den inte syns förrän det
finns mer än en användare — och då syns den inte som ett fel utan som att
bevakningen blir en dag gammal. Vägen förbi finns nu i koden, men **förvalet är
fortfarande en del.** Kapaciteten höjs den dagen `DISCOVERY_SHARDS` sätts i
Vercel, inte av att fan-out är byggd. Det är avsiktligt — arkitekturen ska
mätas innan den blir varje morgons väg — men det betyder att punkten inte är
avbockad förrän variabeln är satt.

**Punkt 2 kan inte skyndas, och den är nu den enda klockan som går.** Sju dygn
är sju dygn, och räkningen börjar om varje gång databasen byts. Punkt 1 blev
klar 2026-08-08, så **tidigaste lansering är 2026-08-15** — och bara om varje
morgon däremellan går igenom utan manuell inblandning.



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
5. ~~Kö-arkitektur för 100+ bolag~~ — **klart 2026-08-08.** Parallellisering,
   tidsbudget och markör 2026-08-07; fan-out 2026-08-08, se avsnitt 6.
   **Avstängd som förval** — `DISCOVERY_SHARDS` sätter på den
6. ~~Larm när en källa tystnar~~ — **klart 2026-08-07.** Härlett ur körningen,
   tabelltestat, och mejlas till `ADMIN_EMAIL` vid `silent` eller `failing`.
   Se avsnitt 7
7. ~~Massimport av bolag från `.xlsx` och `.csv`~~ — **klart 2026-08-07**, se
   avsnitt 5. **Ej testad med en riktig uppladdning** — det kräver inloggning,
   vilket en automatisk körning inte kan göra. Parsningen är verifierad i
   produktionsmiljön via `/api/debug/import-test`, men själva formuläret har
   ingen människa provat
8. ~~**Verifierad mejldomän**~~ — **klart 2026-08-08.** Strato-brevlåda på egen
   domän över SMTP, SPF publicerad, och **leverans bekräftad i Gmails
   Primär-flik 16:14**. Brevo valdes bort. Se avsnitt 6
9. ~~Mät GNews täckning över flera **lokala** bolag och slå av den om bilden
   håller~~ — **klart 2026-08-07.** Mätt över åtta bolag, GNews avstängd som
   standard. Se avsnitt 7
10. ~~Kostnadstak per **användare**, inte bara per import~~ — **klart
    2026-08-07.** Portföljtak härlett ur körningens kapacitet, se avsnitt 6
11. ~~Spärrlista mot domäner som inte är nyhetskällor~~ — **klart
    2026-08-07** i `8631975`, men punkten blev stående kvar här till
    2026-08-08. Bolagsregister och sociala nätverk spärras på domän,
    kurssidor på **sökväg** — se `relevance.ts` för varför skillnaden är
    nödvändig
12. **Bestäm vad som gäller för klockslaget vintertid.** Cron går på UTC, så
    `0 5 * * *` blir 06:00 svensk tid när sommartiden upphör. Antingen
    accepteras driften — och då bör kriterium 2 i avsnitt 4 skrivas om — eller
    så krävs Vercel Pro. Det är ett beslut, inte en bugg
13. **Kör sju dygn i rad och belägg det.** Kriterium 2 kan inte bevisas snabbare
    än sju dygn, och räkningen börjar om varje gång databasen byts. Förutsätter
    att punkt 8 är löst först, annars mäter vi ett mejl ingen får

### Fas 2

14. ~~Granska hyresgästisoleringen~~ — **klart 2026-08-07.** Ingen läcka, se
    avsnitt 3
15. ~~Missbruksskydd på inloggningen~~ — **klart 2026-08-07.** Tak per adress
    och globalt, se avsnitt 3
16. ~~GDPR: radering och export av egen data~~ — **klart 2026-08-07.**
    `/dashboard/konto`
17. ~~Personuppgiftspolicy~~ — **klart 2026-08-07.** `/integritetspolicy`
18. **Bestäm om registreringen ska begränsas** — *spärren är byggd
    2026-08-08, beslutet återstår.* `SIGNUP_MODE` styr: `open` (förval, alltså
    dagens beteende), `invite` med `SIGNUP_ALLOWLIST`, eller `closed`.
    Befintliga användare släpps alltid in, även i `closed`. Kontrollen sitter i
    Auth.js `signIn`-callback och inte på ett formulär, eftersom magisk länk
    gör inloggning och registrering till samma handling.

    Det här behöver bestämmas **innan** mejldomänen verifieras, inte efter.
    Idag hindras en främling bara av att mejlet inte kommer fram; den dagen
    punkt 8 är löst faller den spärren över en natt
20. ~~**Gränssnittsluckor som inte blockerar.**~~ — **klart 2026-08-08.**
    Avregistreringslänk, byte av mejladress, laddningstillstånd och mobilvy.
    Se nedan och avsnitt 6

    **Laddningstillstånd.** Delad `SubmitButton` med `useFormStatus` på varje
    formulär. Det är inte kosmetika: utan återkoppling ser en långsam åtgärd
    ut som en trasig, och det andra klicket kostar på riktigt — `addCompany`
    kör en hel sökning till, `requestEmailChange` skickar ännu ett
    bekräftelsemejl, och inloggningsformuläret bränner ett av de fem
    mejl per adress och timme. Knappen är både ett besked och en spärr.

    **Mobilvyn.** Tre saker sprack under ~400 px och är rättade: kontosidans
    statistikkort låg i tre kolumner, adressfältet och raderingsrutan hade
    fasta bredder, och inkorgens rubrikrad klämde ihop räknaren.

    **Byte av mejladress** sker i två steg: bekräftelselänken går till den
    **nya** adressen och kontot flyttas först när någon klickat på den. Skälet
    är att adressen inte är en kontaktuppgift utan inloggningsuppgiften — med
    magisk länk finns inget lösenord att falla tillbaka på, så ett byte som slog
    igenom direkt skulle göra en felstavning permanent.

    Länken bär sin egen behörighet på samma sätt som avregistreringen: HMAC över
    `AUTH_SECRET`, ingen tabell och ingen migration. Signaturen räknas över
    kontots *nuvarande* adress, vilket gör den engångs utan att förbrukning
    behöver lagras — efter bytet verifierar den inte längre, så en gammal länk
    kan inte rulla tillbaka ett senare byte. Bekräftelsesidan ligger på
    `/byt-mejl`, utanför `/dashboard`, eftersom den layouten omdirigerar
    utloggade till inloggningen.
19. ~~Byt utskicksväg så att leverantören går att välja~~ — **klart
    2026-08-07.** SMTP eller Resend, styrt av miljön
