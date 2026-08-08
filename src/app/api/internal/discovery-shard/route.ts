import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
import { runDiscoveryForCompanyIds } from "@/lib/search/runDiscoveryShard";

/**
 * En del av morgonkörningen, i en egen funktion.
 *
 * Finns bara för att `executeDiscoveryJob` ska kunna anropa sig själv och
 * därmed få mer än 60 sekunder totalt — se `discoveryShards.ts` för varför det
 * är den enda vägen förbi taket på 110 bolag.
 *
 * **Skyddad med samma `CRON_SECRET` som morgonjobbet.** Rutten är intern i den
 * meningen att bara tjänsten anropar den, men den är publik på nätet och
 * startar exakt samma arbete: den söker mot fyra externa källor per bolag och
 * skriver till databasen. Ett svagare skydd här hade gjort hela morgonjobbet
 * lika svagt skyddat.
 *
 * **POST och inte GET** eftersom listan med bolag kan bli lång nog att spränga
 * en URL, och därför att den inte ska kunna hamna i en cache eller en logg.
 *
 * Skickar inga mejl. Samordnaren är den enda som ser alla delar, och bara den
 * kan veta om en användare har artiklar i mer än en del — annars hade samma
 * mottagare fått ett mejl per del.
 */

export const maxDuration = 60;

/** Ingen cache någonstans: ett sökresultat är färskvara per definition. */
export const dynamic = "force-dynamic";

interface ShardRequestBody {
  companyIds?: unknown;
}

/**
 * Taket är delkörningens andel av portföljtaket, med marginal. Det finns inte
 * för att begränsa oss själva utan för att en trasig eller påhittad förfrågan
 * inte ska kunna starta ett godtyckligt stort arbete.
 */
const MAX_COMPANY_IDS = 1_000;

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = verifyCronSecret(request);
  if (unauthorized) {
    return unauthorized;
  }

  let body: ShardRequestBody;

  try {
    body = (await request.json()) as ShardRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { companyIds } = body;

  if (
    !Array.isArray(companyIds) ||
    !companyIds.every((id): id is string => typeof id === "string")
  ) {
    return NextResponse.json(
      { error: "companyIds must be an array of strings" },
      { status: 400 },
    );
  }

  if (companyIds.length > MAX_COMPANY_IDS) {
    return NextResponse.json(
      { error: `companyIds must not exceed ${MAX_COMPANY_IDS} entries` },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await runDiscoveryForCompanyIds(companyIds));
  } catch (error) {
    // Loggas här därför att samordnaren bara ser en HTTP-status. Utan det här
    // vore ett fel i en delkörning osynligt annat än som färre artiklar.
    console.error("Delkörningen misslyckades:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
