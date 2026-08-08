/**
 * Tjänstens publika adress, för länkar som skickas ut ur appen.
 *
 * Behövs eftersom ett mejl inte har någon request att räkna adressen ur — och
 * en relativ länk i ett mejl går ingenstans. Auth.js löser samma problem med
 * `AUTH_URL`, men den variabeln är just nu felaktig i produktionsmiljön (se
 * PROJECT.md avsnitt 6) och `auth.ts` raderar den aktivt när den ser trasig ut.
 * Att bygga avregistreringslänken på den vore att bygga på det enda värde vi
 * vet är fel.
 *
 * Ordningen nedan går från *mest medvetet satt* till *mest härledd*:
 *
 * 1. `APP_URL` — en människa har skrivit in den. Vinner alltid.
 * 2. Requestens egen värd. Stämmer per definition, eftersom mottagaren nyss nått
 *    oss där. Cron-anropet från Vercel bär produktionsvärden.
 * 3. `VERCEL_PROJECT_PRODUCTION_URL` — Vercels egen variabel för projektets
 *    produktionsadress. Stabil över deployer, till skillnad från `VERCEL_URL`
 *    som är unik per deploy och därför slutar fungera när deployen städas bort.
 *
 * Null när inget av dem finns. Anroparen ska då utelämna länken, inte gissa.
 */

function normalize(value: string | undefined): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  // Vercels variabler saknar schema ("mitt-projekt.vercel.app"), medan en
  // handskriven APP_URL oftast har det. Båda formerna ska fungera.
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

function originFromRequest(request: Request | undefined): string | null {
  if (!request) {
    return null;
  }

  try {
    // `x-forwarded-host` framför `host`: bakom Vercels proxy är `host` den
    // interna värden, och en länk dit når ingen utifrån.
    const forwarded = request.headers.get("x-forwarded-host");
    const proto = request.headers.get("x-forwarded-proto") ?? "https";

    if (forwarded) {
      return normalize(`${proto}://${forwarded}`);
    }

    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

export function resolveAppBaseUrl(
  request?: Request,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return (
    normalize(env.APP_URL) ??
    originFromRequest(request) ??
    normalize(env.VERCEL_PROJECT_PRODUCTION_URL)
  );
}

/**
 * Samma ordning, men för anropare som har huvudena utan att ha en `Request`.
 *
 * Serverfunktioner är just det fallet: de körs i en request men får den aldrig
 * som argument, och `headers()` är det enda de har. Att bygga en låtsas-Request
 * bara för att komma åt `resolveAppBaseUrl` skulle betyda att härledningen
 * fanns i två varianter som kan glida isär — det här är samma tre steg med en
 * annan ingång.
 */
export function resolveAppBaseUrlFromHost(
  host: string | null | undefined,
  proto: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const trimmedHost = host?.trim();

  return (
    normalize(env.APP_URL) ??
    normalize(trimmedHost ? `${proto?.trim() || "https"}://${trimmedHost}` : undefined) ??
    normalize(env.VERCEL_PROJECT_PRODUCTION_URL)
  );
}
