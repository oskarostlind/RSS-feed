import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Avregistreringslänken måste fungera **utan inloggning**.
 *
 * Den som vill sluta få mejl ska inte först behöva begära en magisk länk, vänta
 * på den, och hoppas att den inte hamnar i skräpposten — särskilt inte i den
 * här tjänsten, där just det är ett känt problem (se PROJECT.md avsnitt 6). En
 * avregistrering som kräver att man löser ett annat problem först är i praktiken
 * ingen avregistrering.
 *
 * Länken bär därför sin egen behörighet: användarens id plus en signatur över
 * det, gjord med `AUTH_SECRET`. Signaturen går inte att räkna fram utan
 * hemligheten, så en främling kan inte avregistrera någon annan ens med ett
 * gissat användar-id.
 *
 * **Varför härledd signatur och inte en sparad token i databasen:** en sparad
 * token är ännu en kolumn som måste skapas vid registrering, migreras för
 * befintliga användare, och backas upp. Den härledda kräver ingenting av det och
 * kan inte komma ur synk med användaren. Priset är att alla länkar slutar
 * fungera om `AUTH_SECRET` roteras — vilket är acceptabelt, eftersom nästa
 * morgonmejl då bär en ny giltig länk.
 *
 * Signaturen ger **inte** inloggning. Den enda åtgärd den öppnar är att stänga
 * av morgonmejlet, vilket är ofarligt att göra av misstag och går att ångra på
 * kontosidan.
 */

/**
 * 32 hextecken = 128 bitar. Räcker med bred marginal mot gissning, och håller
 * länken kort nog att inte radbrytas i mejlklienter — en bruten URL är en URL
 * som inte går att klicka på.
 */
const TOKEN_LENGTH = 32;

function resolveSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.AUTH_SECRET?.trim() || null;
}

/**
 * Null när hemligheten saknas. Anropare ska då utelämna länken helt i stället
 * för att skicka en som inte fungerar — ett trasigt avregistreringsalternativ är
 * värre än inget, både för mottagaren och för avsändarryktet.
 */
export function createUnsubscribeToken(
  userId: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const secret = resolveSecret(env);

  if (!secret) {
    return null;
  }

  return createHmac("sha256", secret)
    .update(`unsubscribe:${userId}`)
    .digest("hex")
    .slice(0, TOKEN_LENGTH);
}

/**
 * Jämförelsen är konstanttid. En vanlig `===` läcker hur många tecken som
 * stämde genom hur lång tid den tog, vilket räcker för att gissa fram en
 * signatur tecken för tecken.
 */
export function verifyUnsubscribeToken(
  userId: string,
  token: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = createUnsubscribeToken(userId, env);

  if (!expected || !token) {
    return false;
  }

  const given = Buffer.from(token, "utf8");
  const want = Buffer.from(expected, "utf8");

  // timingSafeEqual kastar på olika längd, så längden kontrolleras först. Det
  // läcker bara längden på signaturen, vilket är en konstant och känd ändå.
  if (given.length !== want.length) {
    return false;
  }

  return timingSafeEqual(given, want);
}

/**
 * Adressen som mejlet ska peka på. Null när något saknas — se
 * `createUnsubscribeToken` för varför halva länken inte är ett alternativ.
 */
export function buildUnsubscribeUrl(
  userId: string,
  baseUrl: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const token = createUnsubscribeToken(userId, env);

  if (!token || !baseUrl) {
    return null;
  }

  const url = new URL("/avregistrera", baseUrl);
  url.searchParams.set("u", userId);
  url.searchParams.set("t", token);

  return url.toString();
}
