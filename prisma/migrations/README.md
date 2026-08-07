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

## Det som återstår

**Byggkommandot kör fortfarande inte migrationerna.** `package.json` har
`prisma generate && next build`, vilket genererar klienten men aldrig rör
databasen. Att lägga till `prisma migrate deploy` skulle stänga hålet helt: en
ny eller återställd databas skulle då få schemat automatiskt vid nästa deploy.

Det steget är medvetet inte taget här, eftersom det ändrar vad varje deploy gör
mot produktionsdatabasen och därför är ett beslut som bör fattas med öppna ögon
och inte av en automatisk körning. Ändringen är i så fall:

```json
"build": "prisma migrate deploy && prisma generate && next build"
```

Baseline-migrationen är förutsättningen för det, och den är nu på plats.
