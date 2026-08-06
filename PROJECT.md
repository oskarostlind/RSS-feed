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

## 6. Vad som måste byggas om innan fas 2

Detta är kända brister, inte spekulation.

**`NewsItem.url` är globalt unik.** Om två användare bevakar samma bolag får
bara den ena artikeln — den andra tystas av dedupliceringen. Måste bli
`@@unique([companyId, url])`. Spricker i samma sekund som andra användaren
lägger till ett bolag någon annan redan följer.

**Cron-arkitekturen håller inte för över 100 bolag.** Vercel Hobby ger en
körning per dygn och 60 sekunders maxtid. Med dagens ~350 ms per bolag räcker
det till 30–50 bolag. Vid 100+ krävs Vercel Pro och en kö där varje körning
betar av en delmängd, alternativt fan-out till parallella funktioner.

**Mejl går bara fram till kontoägaren.** Avsändaren är `onboarding@resend.dev`,
och Resends gratisnivå levererar bara till kontots egen adress. Kräver
verifierad domän innan någon annan kan få mejl.

**Ingen kostnadskontroll per användare.** Med öppen registrering kan en
användare lägga in obegränsat många bolag. Behöver tak och köhantering.

## 7. Risker som är billigare att veta om nu

**Google News RSS är odokumenterat.** Det är gratis och fungerar utmärkt, men
det är ingen officiell produkt med serviceåtagande. Google kan strypa eller
ändra formatet utan förvarning. För ett personligt verktyg är det acceptabelt.
För en produkt någon betalar för är det en enskild felkälla utan reservplan.
Vi behöver minst en oberoende källa innan fas 2.

**Länkarna går via Google.** Nya artikel-ID:n är krypterade, så publicistens
riktiga URL går inte att gräva fram. Länken fungerar för en läsare, men
dedupliceringen blir sämre och det ser mindre proffsigt ut i en säljbar produkt.

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

1. Tidsfönster i cron-jobbet så att arkivartiklar inte mejlas
2. Rätta `NewsItem`-unikheten till `@@unique([companyId, url])`
3. Registerhändelser från Bolagsverket och Post- och Inrikes Tidningar
4. Jobbannonser via JobTech
5. Kö-arkitektur för 100+ bolag
6. Verifierad mejldomän i Resend
