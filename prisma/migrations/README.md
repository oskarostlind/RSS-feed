# Migrationer

## Varför den här katalogen finns

Fram till 2026-08-07 hade schemat ingen migrationshistorik. Tabellerna hade bara
någonsin skapats med `prisma db push` från en laptop, och byggkommandot rör inte
databasen. Följden var att **ingen deploy kunde återställa schemat, och ingen
kunde läsa ut ur repot vilket schema produktionen faktiskt hade.**

Det var inte teoretiskt. 2026-08-07 svarade `/api/cron/search` med 500 och
`P2021 — The table public.Company does not exist`, därför att `DATABASE_URL`
pekade på en nyuppsatt tom Neon-databas. Morgonjobbet var nere, tyst, tills
någon undrade var mejlet tog vägen.

## `0_init`

En baseline. Den beskriver schemat så som det såg ut när historiken infördes,
och är **redan markerad som körd** i produktionsdatabasen med
`prisma migrate resolve --applied 0_init`. Den kommer alltså aldrig att köras
mot den databasen — den finns för att en *ny* databas ska kunna få samma schema
utan att någon minns vilka `db push` som gjordes när.

Innehållet är genererat med `prisma migrate diff --from-empty`, alltså ur
schemat självt, och `prisma db push` bekräftade samtidigt att schemat och
produktionen var i synk.

## Så gör du en schemaändring från och med nu

```bash
# 1. Ändra prisma/schema.prisma
# 2. Skapa migrationen
npx prisma migrate dev --name beskrivande_namn
```

Det skriver både SQL-filen och kör den lokalt. Committa filen tillsammans med
schemaändringen.

## Byggkommandot kör migrationerna

**Sedan 2026-08-07 är hålet stängt.** `package.json` har numera:

```json
"build": "prisma migrate deploy && prisma generate && next build"
```

En ny eller återställd databas får därmed schemat automatiskt vid nästa deploy,
och `P2021 — The table public.Company does not exist` kan inte längre uppstå av
att någon pekat om `DATABASE_URL`.

Kontrollerat före ändringen: baseline `0_init` är markerad som körd i
produktionsdatabasen, och `prisma migrate deploy` mot den svarar
`No pending migrations to apply`. Kommandot är alltså en no-op mot en databas
som redan är i synk — även mot Neons pooler-endpoint, vilket var den andra
osäkerheten.

### Priset, som du bör känna till

**Deployen beror nu på att databasen svarar.** Är Neon nere eller
`DATABASE_URL` fel, misslyckas bygget i stället för att gå igenom med en app som
inte kan läsa något. Det är avsiktligt — ett trasigt bygge syns, en tyst tom
databas gör inte det, och det var precis den tystnaden som fällde morgonjobbet
2026-08-07. Men det betyder att en databasincident numera också blockerar
utrullningar.

Vill du backa: ta bort `prisma migrate deploy && ` ur `build`.
