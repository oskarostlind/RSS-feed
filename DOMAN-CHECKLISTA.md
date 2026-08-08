# Sätta igång kundnytt.se

Webbdomänen är klar sedan 2026-08-08 — se avsnitt 6. Det som återstod var
mejlleveransen, och den är löst med **Strato-brevlådan i stället för Brevo**.

Skälet till bytet är att du redan betalar för Strato-mejlen och redan äger
domänen där. Brevo hade betytt ett konto till, en DNS-omgång till, och en
leverantör till att hålla reda på — för samma sak. Koden brydde sig aldrig:
`transport.ts` väljer SMTP så fort `SMTP_HOST` är satt, oavsett vem som står
bakom.

**Kvar att veta:** Strato publicerar inget sändningstak per dygn. En vanlig
brevlåda är byggd för människor, inte för utskick. Med en handfull användare
spelar det ingen roll, men fråga supporten innan volymen växer — och byt då
till en riktig utskickstjänst, vilket är fyra variabler och ingen kodändring.

---

## 1. Strato — brevlådan ~~återstår~~ **klar 2026-08-08**

`notiser@kundnytt.se` skapad under **E-post**. Paketet rymmer 26 brevlådor.

## 2. Strato — SPF ~~återstår~~ **klar 2026-08-08**

Under **Domännamn → kundnytt.se → DNS → TXT- och CNAME-poster**, valet
**STRATO SPF-regel** satt till *"Standard STRATO e-postserver"*. Den stod på
*"Ingen"*, och utan den sorteras mejlen som skräppost oavsett hur rätt allt
annat är. DMARC låg redan på Stratos standardregel.

Att SPF här är en radioknapp och inte en handskriven TXT-post är hela vinsten
med att mejla från samma leverantör som äger DNS:en.

## 3. Strato — serveradresserna

Står i **E-post → notiser@kundnytt.se → Server för inkommande/utgående e-post**.
Värdnamnet är `smtp.strato.com` — inte `.se` och inte `.de`, vilket är värt att
notera eftersom Stratos egen FAQ säger `.de`. Läs alltid av panelen.

## 4. Vercel — miljövariabler ~~återstår~~ **klara 2026-08-08**

Projektet `rss-feed`, **Settings → Environment Variables**, Production:

| Variabel | Värde |
|---|---|
| `SMTP_HOST` | `smtp.strato.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `notiser@kundnytt.se` |
| `SMTP_PASS` | lösenordet på brevlådan |
| `EMAIL_FROM` | `notiser@kundnytt.se` |
| `APP_URL` | `https://www.kundnytt.se` |

`EMAIL_FROM` är med flit **bara adressen**. `resolveSender` lägger på
avsändarnamnet när det saknas, vilket undviker citattecken i ett fält som inte
hanterar dem väl.

**Variabler slår igenom först vid nästa deploy.** De bakas in vid bygget, så
att spara dem räcker inte — det stod fel här tidigare. Pusha något, eller
tryck Redeploy.

Passa samtidigt på att **rätta eller ta bort `AUTH_URL`**. Värdet är
`https://rss-feed-lime.vercel.` — en avklippt inklistring. Koden har ett
skyddsnät som ignorerar den, men skyddsnätet täcker just det felmönstret och
inte alla. Rätt värde är numera `https://www.kundnytt.se`.

## 5. Kontrollera

```
/api/debug/email-test?secret=<CRON_SECRET>&dry=1
```

Ska svara `"vag": "smtp"` och `"verifieradDoman": true`. Gör den det, ta bort
`&dry=1` — då kommer ett testmejl.

Kommer det fram: **logga ut och begär en ny inloggningslänk.** Det är det enda
som verkligen bevisar att kedjan håller, och det testet har aldrig gått igenom
skarpt.

## 6. Domänen mot Vercel — ~~återstår~~ **klart 2026-08-08**

Sajten ligger på **https://www.kundnytt.se**. Apex `kundnytt.se` svarar 308 och
skickar vidare till `www`, vilket är Vercels rekommenderade upplägg — och det
som redan gällde för dina andra domäner.

Posterna som lades in hos Strato:

| Typ | Namn | Värde |
|---|---|---|
| A | `@` | `216.198.79.1` |
| CNAME | `www` | `cc51b1dc9ff7ea6b.vercel-dns-017.com.` |

Två anteckningar som gäller nästa gång:

- **CNAME-värdet är unikt per projekt.** Det där hexprefixet hör till
  `rss-feed` och går inte att återanvända för en annan domän eller ett annat
  projekt — hämta alltid det aktuella ur Vercels domänvy.
- **Vercel-MCP:n kan inte lägga till domäner.** Den kan köpa nya och läsa
  projektet, men själva kopplingen görs i webbgränssnittet. Det som stod här
  tidigare lovade för mycket.

Vill du hellre ha apex som kanonisk adress går det att byta i Vercel utan
kodändring: `resolveAppBaseUrl` härleder adressen ur requesten, så länkarna i
mejlen följer med av sig själva.

---

## Vad som händer sedan

Med mejlleveransen på plats faller de sista bitarna:

- **§9.18 — öppna registreringen.** Ingen kodspärr finns idag; Auth.js skapar
  användaren vid första magiska länken. Det är avsiktligt orört tills mejlen
  fungerar.
- **§4.2 — sju dygn i rad.** Räkningen kan börja först när mejlen kommer fram.
  Det är det enda kriteriet i fas 1 som fortfarande fattas.
