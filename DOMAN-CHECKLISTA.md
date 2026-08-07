# Sätta igång foretagskollen.se

Koden är klar och väntar på fyra miljövariabler. Inget behöver deployas om — allt
styrs av variabler, och Vercel startar om funktionerna när de sparas.

Ordningen spelar roll: **domänen måste vara verifierad hos Brevo innan du sätter
`EMAIL_FROM`.** Sätter du avsändaren för tidigt skickar tjänsten från en domän
som ännu inte får skicka, och de mejlen studsar.

---

## 1. Brevo — skapa konto och lägg till domänen

1. Skapa konto på [brevo.com](https://www.brevo.com). Gratisnivån ger 300 mejl
   per dygn, vilket är tio gånger vad tjänsten behöver med en handfull
   användare.
2. Gå till **Senders, Domains & Dedicated IPs → Domains → Add a domain**.
3. Ange `mail.foretagskollen.se`. Alltså subdomänen, inte roten — går något fel
   med avsändarryktet träffar det inte huvuddomänen, och du kan lägga en
   striktare DMARC-policy på roten senare.
4. Brevo visar tre eller fyra DNS-poster. Ha dem framme till nästa steg.

## 2. Strato — lägg in DNS-posterna

Under **Domäner → foretagskollen.se → DNS-inställningar**.

Posterna Brevo ger dig ser ut ungefär så här. **Använd Brevos egna värden**, inte
dessa — de är bara till för att du ska känna igen formen:

| Typ | Namn | Värde |
|---|---|---|
| TXT | `brevo-code.mail` | verifieringssträngen från Brevo |
| TXT | `mail` | `v=spf1 include:spf.brevo.com mx ~all` |
| TXT | `mail._domainkey.mail` | DKIM-nyckeln från Brevo |
| TXT | `_dmarc.mail` | `v=DMARC1; p=none; rua=mailto:oskarandreassen01@gmail.com` |

Två fällor med Strato:

- **Strato lägger till domänen automatiskt.** Skriver du `mail.foretagskollen.se`
  i namnfältet blir posten `mail.foretagskollen.se.foretagskollen.se`. Skriv bara
  `mail`.
- **Spridningen tar 15 minuter till några timmar.** Verifierar Brevo inte direkt
  är det oftast bara att vänta, inte att posten är fel.

`p=none` i DMARC är avsiktligt till att börja med: den rapporterar men blockerar
inget. Skärp till `p=quarantine` när du sett några veckors rapporter utan
problem.

## 3. Brevo — SMTP-nycklar

**SMTP & API → SMTP**. Där finns värdnamn, port, användarnamn och en
lösenordsnyckel du får generera. Nyckeln visas en gång.

## 4. Vercel — miljövariabler

Projektet `rss-feed`, **Settings → Environment Variables**, Production:

| Variabel | Värde |
|---|---|
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | ditt Brevo-SMTP-användarnamn |
| `SMTP_PASS` | SMTP-nyckeln |
| `EMAIL_FROM` | `Företagskollen <notiser@mail.foretagskollen.se>` |

Passa samtidigt på att **rätta eller ta bort `AUTH_URL`**. Värdet är
`https://rss-feed-lime.vercel.` — en avklippt inklistring. Koden har ett
skyddsnät som ignorerar den, men skyddsnätet täcker just det felmönstret och
inte alla.

## 5. Kontrollera

```
/api/debug/email-test?secret=<CRON_SECRET>&dry=1
```

Ska svara `"vag": "smtp"` och `"verifieradDoman": true`. Gör den det, ta bort
`&dry=1` — då kommer ett testmejl.

Kommer det fram: **logga ut och begär en ny inloggningslänk.** Det är det enda
som verkligen bevisar att kedjan håller, och det testet har aldrig gått igenom
skarpt.

## 6. Domänen mot Vercel

Skilt från mejlen. I Vercel, **Settings → Domains → Add** `foretagskollen.se`.
Vercel säger vilken A- eller CNAME-post som ska in hos Strato. Säg till så gör
jag det via Vercel-MCP:n.

---

## Vad som händer sedan

Med mejlleveransen på plats faller de sista bitarna:

- **§9.18 — öppna registreringen.** Ingen kodspärr finns idag; Auth.js skapar
  användaren vid första magiska länken. Det är avsiktligt orört tills mejlen
  fungerar.
- **§4.2 — sju dygn i rad.** Räkningen kan börja först när mejlen kommer fram.
  Det är det enda kriteriet i fas 1 som fortfarande fattas.
