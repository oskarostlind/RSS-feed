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
| Registerhändelser | Bolagsverket, Post- och Inrikes Tidningar | **Ej byggt.** Konkurser, ägarbyten, styrelseändringar, bokslut |
| Jobbannonser | Arbetsförmedlingens JobTech (öppet API) | **Ej byggt.** Rekrytering avslöjar expansion före pressen |

Registerhändelser och jobbannonser är strukturerad data, inte fritext. De
behöver egna datamodeller — dagens `NewsItem` med rubrik och länk passar dåligt
för "styrelseändring registrerad 2026-04-01".

### Så kommer bolagen in

Idag går det bara att lägga till ett bolag i taget via ett textfält. Med den
skala vi siktar på — över 100 bolag — är det ohållbart. En AM har redan sin
kundlista i Excel eller ett CRM och ska inte behöva knappa in den för hand.

**Massimport från fil** är därför ett krav, inte en bekvämlighet. Kravbilden:

- Tar emot `.xlsx` och `.csv`. Excel är formatet en säljare faktiskt har.
- Låter användaren peka ut vilken kolumn som innehåller bolagsnamnet, i stället
  för att gissa. Filer från CRM har sällan en kolumn som heter "Företagsnamn".
- **Visar en förhandsgranskning innan något sparas.** Att importera 150 fel
  namn och sedan få bevakningar på alla är svårt att ångra.
- Flaggar dubbletter mot portföljen och inom filen.
- Normaliserar bolagsformer så att "Peges i Ljusdal AB" och "Peges i Ljusdal"
  inte blir två bevakningar.
- Rapporterar per rad vad som gick igenom och vad som hoppades över, med skäl.

Importen bör inte påbörjas innan kö-arkitekturen i avsnitt 6 är på plats — se
kopplingen där.

## 6. Vad som måste byggas om innan fas 2

Detta är kända brister, inte spekulation.

~~**`NewsItem.url` är globalt unik.**~~ **Åtgärdat 2026-08-07.** Unikheten är
nu `@@unique([companyId, url])`, och dedupliceringen i `persistSearchHits`
filtrerar per bolag i stället för globalt. Rättningen gjordes samtidigt som
schemat lades på den nya databasen, medan tabellerna var tomma — mot en
databas med data hade samma ändring krävt att man först hittade och slog ihop
befintliga dubbletter.

**Cron-arkitekturen håller inte för över 100 bolag.** Vercel Hobby ger en
körning per dygn och 60 sekunders maxtid. Med dagens ~350 ms per bolag räcker
det till 30–50 bolag. Vid 100+ krävs Vercel Pro och en kö där varje körning
betar av en delmängd, alternativt fan-out till parallella funktioner.

Massimporten och kö-arkitekturen hänger ihop: i samma stund som en användare
kan ladda upp en Excel med 150 rader spricker morgonkörningen på tidsgränsen.
Bygger vi importen först får vi en funktion som omedelbart sänker systemet. Kön
ska därför på plats först.

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

**Mejl går bara fram till kontoägaren.** Avsändaren är `onboarding@resend.dev`,
och Resends gratisnivå levererar bara till kontots egen adress. Kräver
verifierad domän innan någon annan kan få mejl.

**Ingen kostnadskontroll per användare.** Med öppen registrering kan en
användare lägga in obegränsat många bolag. Behöver tak och köhantering.

**Schemat är inte reproducerbart.** Det finns ingen `prisma/migrations`-katalog
— tabellerna har bara någonsin skapats med `prisma db push` från en laptop. Och
byggkommandot är `prisma generate && next build`, som genererar klienten men
aldrig rör databasen. Ingen deploy kan alltså återställa schemat, och ingen kan
se i repot vilket schema produktionen faktiskt har.

Det var inte teoretiskt: 2026-08-07 svarade `/api/cron/search` med 500 och
`P2021 — The table public.Company does not exist`. Orsaken var att
`DATABASE_URL` pekade på en nyuppsatt, tom Neon-databas som aldrig fått
schemat. Åtgärdat samma dag med `prisma db push` mot `neondb`, som då bara
innehöll en tom `_prisma_migrations`-tabell — ingen data gick förlorad.

**Grundproblemet kvarstår dock:** nästa gång databasen byts ut händer exakt
samma sak, tyst, och upptäcks först när någon undrar var morgonmejlet tog
vägen. Att lägga `prisma migrate deploy` i byggkommandot kräver först att
schemat får en riktig migrationshistorik — `db push` skriver ingen. Det är
nästa strukturella skuld att betala av.

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
kl 07 uteblir mejlet utan att någon får veta att bevakningen låg nere. Vi
behöver ett larm som jämför utfallet mot ett känt referensvärde och säger till
när en källa tystnar — inte bara när den kastar fel. `?probe=` i
`/api/debug/source-test` visar råsvaret och är första steget dit.

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
3. Registerhändelser från Bolagsverket och Post- och Inrikes Tidningar
4. Jobbannonser via JobTech
5. Kö-arkitektur för 100+ bolag
6. Massimport av bolag från `.xlsx` och `.csv` — se avsnitt 5. Förutsätter
   punkt 5, annars sänker första stora importen morgonkörningen
7. Verifierad mejldomän i Resend
