/**
 * Normalisering och kontroll av mejladresser som användaren skrivit in själv.
 *
 * Ligger i en egen modul därför att adressen i den här tjänsten inte är en
 * kontaktuppgift utan **inloggningsuppgiften**. Med magisk länk finns inget
 * lösenord att falla tillbaka på: skrivs adressen fel vid ett byte är kontot
 * borta för användaren, och ingen självbetjäning kan laga det. Kontrollen
 * förtjänar därför att vara ett eget, testat ställe i stället för ett reguljärt
 * uttryck inklistrat där det råkade behövas.
 *
 * Vi validerar med flit **tunt**. Adressens riktiga prov är att mejlet med
 * bekräftelselänken kommer fram — en strängare regel än så avvisar bara
 * ovanliga men giltiga adresser, och det felet är tyst för oss och obegripligt
 * för den som drabbas.
 */

/**
 * Domäner som aldrig går att leverera till. Samma lista som morgonkörningen
 * använder för att slippa räkna ett seed-konto som ett misslyckat utskick — de
 * hör ihop, för ett byte till en sådan adress skulle göra kontot ostängbart på
 * exakt det sätt kommentaren ovan varnar för.
 */
const UNDELIVERABLE_DOMAINS = ["localhost", "example.com", "test", "invalid"];

/** Skydd mot att en klistrad textmassa hamnar i databasens unika index. */
const MAX_LENGTH = 254;

/**
 * Returnerar adressen i sin lagrade form, eller null om den inte går att
 * använda. Gemener därför att `User.email` är unik och skiftlägeskänslig i
 * Postgres: utan normalisering blir `Anna@…` och `anna@…` två konton, och
 * användaren loggar in på det ena och undrar var bevakningarna tog vägen.
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim().toLowerCase();

  if (trimmed.length === 0 || trimmed.length > MAX_LENGTH) {
    return null;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return null;
  }

  const domain = trimmed.split("@")[1] ?? "";

  if (UNDELIVERABLE_DOMAINS.includes(domain)) {
    return null;
  }

  return trimmed;
}
