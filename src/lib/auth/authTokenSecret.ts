import { createHash, randomBytes } from "node:crypto";

/**
 * Hemligheten i en engångslänk, skild från databasfrågorna som använder den.
 *
 * Uppdelningen är gjord av samma skäl som `portfolioCapacity.ts` är skild från
 * `portfolioLimit.ts`: en modul som importerar Prisma-klienten går inte att
 * ladda i en testkörning utan databas. Låg det här i `authTokens.ts` gick den
 * mest säkerhetskänsliga koden i tjänsten inte att testa alls.
 *
 * **Varför länken bara bär en slumpsträng.** Tjänsten använde först signerade
 * tokens som bar användar-id, måladress och utgångstid direkt i URL:en:
 *
 *   /byt-mejl?u=c615a1&e=ny@adress.se&x=1786190000000&t=9fad9685...
 *
 * 2026-08-08 spärrade Chrome en av tjänstens egna inloggningslänkar med
 * "Farlig webbplats". Domänen var inte spärrlistad — Googles insynsrapport
 * hade ingen data om den — utan det var formen som larmade: en ny domän, en
 * länk som kom via mejl, en lång hex-token, en mejladress i klartext och en
 * parameter som pekade vidare till en annan URL. Det är exakt hur nätfiske ser
 * ut, och mot en klassificerare hjälper inga förklaringar.
 *
 * Länken är nu `/verifiera?t=3aF9_kQ2LmZpXq7BvN1sYw` och avslöjar varken vem
 * den gäller eller vad den gör.
 */

/**
 * 24 slumpade byte blir 32 tecken i base64url. Gott om entropi mot gissning,
 * och kort nog att inte radbrytas i en mejlklient — en bruten URL är en URL
 * som inte går att klicka på.
 */
const SECRET_BYTES = 24;

export function generateTokenSecret(): string {
  return randomBytes(SECRET_BYTES).toString("base64url");
}

/**
 * Ingen salt och ingen kostnadsparameter, till skillnad från lösenord. Det är
 * med flit: hemligheten är redan 192 slumpade bitar, så det finns ingen
 * ordlista att pröva mot. En långsam hash hade bara gjort varje klick
 * långsammare utan att göra något svårare.
 *
 * Deterministisk måste den vara, eftersom uppslagningen slår på hashen.
 */
export function hashTokenSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("base64url");
}

export type AuthTokenFailure = "saknas" | "ogiltig" | "utgangen" | "forbrukad";

/**
 * Ett besked användaren kan agera på. Formuleringarna skiljer på "länken är
 * slut" och "länken var aldrig giltig", eftersom råden är olika: det första
 * betyder begär en ny, det andra att länken sannolikt brutits i mejlprogrammet.
 */
export function describeAuthTokenFailure(reason: AuthTokenFailure): string {
  switch (reason) {
    case "utgangen":
      return "Länken har gått ut. Begär en ny så skickar vi ett nytt mejl.";
    case "forbrukad":
      return "Länken är redan använd. Begär en ny om du behöver göra om det.";
    case "saknas":
      return "Länken är ofullständig. Prova att kopiera hela adressen från mejlet.";
    case "ogiltig":
      return "Länken gäller inte. Den kan ha brutits i mejlprogrammet, eller ersatts av en nyare.";
  }
}
