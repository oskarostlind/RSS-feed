/**
 * Vem som får bli ny användare.
 *
 * Registreringen har hittills varit öppen av misstag snarare än av beslut:
 * Auth.js skapar användaren vid första magiska länken, och det enda som hindrat
 * en främling är att mejlet inte kommit fram (se PROJECT.md avsnitt 6). När
 * mejldomänen väl är verifierad försvinner den spärren över en natt — och då är
 * fel läge att börja fundera på om det var meningen.
 *
 * Därför en uttalad inställning, styrd av `SIGNUP_MODE`:
 *
 * - `open` — vem som helst. **Förval, alltså dagens beteende oförändrat.**
 * - `invite` — bara adresser i `SIGNUP_ALLOWLIST`, kommaseparerat.
 * - `closed` — inga nya alls. Befintliga användare loggar in som vanligt.
 *
 * Kontrollen sitter på *inloggningsförsöket* och inte på ett formulär, därför
 * att det inte finns något registreringsformulär. Inloggning och registrering
 * är samma handling i en tjänst med magisk länk, och den enda skillnaden är om
 * adressen redan finns i databasen.
 *
 * Befintliga användare släpps alltid igenom, även i `closed`. Att stänga
 * registreringen får inte råka låsa ute dem som redan betalat.
 */

export type SignupMode = "open" | "invite" | "closed";

export function resolveSignupMode(
  env: NodeJS.ProcessEnv = process.env,
): SignupMode {
  const raw = env.SIGNUP_MODE?.trim().toLowerCase();

  if (raw === "invite" || raw === "closed") {
    return raw;
  }

  // Allt annat — inklusive stavfel — betyder öppet. Ett stavfel ska inte tyst
  // stänga tjänsten; det felet upptäcks först när ingen kan logga in.
  return "open";
}

/**
 * Adresserna som får skapa konto i `invite`-läge.
 *
 * Kommaseparerad lista i en miljövariabel och inte en tabell: så länge det rör
 * sig om en handfull inbjudna är en tabell mest ceremoni, och en variabel går
 * att ändra utan deploy. Växer listan förbi vad som ryms i ett fält är det
 * signalen att bygga riktiga inbjudningskoder.
 */
export function resolveSignupAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const raw = env.SIGNUP_ALLOWLIST ?? "";

  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Sant när adressen får logga in. `isExistingUser` avgör om det är en
 * registrering eller bara en inloggning — bara det förra kan nekas.
 */
export function isSignInAllowed(
  email: string,
  isExistingUser: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isExistingUser) {
    return true;
  }

  const mode = resolveSignupMode(env);

  if (mode === "open") {
    return true;
  }

  if (mode === "closed") {
    return false;
  }

  return resolveSignupAllowlist(env).has(email.trim().toLowerCase());
}
