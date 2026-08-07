import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
import { EmailService } from "@/lib/email/EmailService";
import { resolveSender } from "@/lib/email/sender";
import { resolveSmtpSettings } from "@/lib/email/transport";
import { formatErrorCause, formatErrorMessage } from "@/lib/utils/formatError";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Skickar ett riktigt morgonmejl med påhittat innehåll till `ADMIN_EMAIL`.
 *
 * Finns därför att mejlvägen annars bara går att prova när det råkar finnas en
 * ny artikel. Efter omskrivningen till SMTP gav två cron-körningar i rad
 * `emailsSent: 0` — helt korrekt, men det betyder att utskicket inte testats,
 * och en trasig mall upptäcks då först kl 07 nästa morgon.
 *
 * Det är inte hypotetiskt i just det här projektet: hela 2026-08-07 gick åt
 * till att mejl såg ut att fungera utan att komma fram.
 *
 *   GET /api/debug/email-test?secret=<CRON_SECRET>
 *   GET /api/debug/email-test?secret=...&dry=1   — visar bara konfigurationen
 */

/** Tydligt påhittat, så att ett testmejl aldrig förväxlas med en riktig nyhet. */
const TESTARTIKEL = {
  id: "test",
  title: "TESTMEJL — Peges i Ljusdal AB förvärvar Jonsson & Paulsson",
  snippet:
    "Det här är ett testutskick från Kundnytt. Innehållet är påhittat och ingen bevakning har utlösts.",
  url: "https://www.di.se/",
  publishedAt: new Date(),
  companyName: "Peges i Ljusdal AB (test)",
};

export async function GET(request: Request): Promise<NextResponse> {
  const unauthorized = verifyCronSecret(request);
  if (unauthorized) {
    return unauthorized;
  }

  const smtp = resolveSmtpSettings();
  const sender = resolveSender();

  // Lösenordet återges aldrig, bara om det finns. Värdnamn och användare är
  // ofarliga och är det man behöver se för att förstå varför vägen blev fel.
  const konfiguration = {
    vag: smtp ? "smtp" : "resend",
    smtpHost: smtp?.host ?? null,
    smtpPort: smtp?.port ?? null,
    smtpUser: smtp?.user ?? null,
    harSmtpLosenord: Boolean(smtp?.pass),
    harResendNyckel: Boolean(process.env.RESEND_API_KEY),
    avsandare: sender.from,
    verifieradDoman: sender.isVerifiedDomain,
    mottagare: process.env.ADMIN_EMAIL ?? null,
  };

  if (new URL(request.url).searchParams.get("dry") === "1") {
    return NextResponse.json({ skickat: false, konfiguration });
  }

  try {
    const result = await EmailService.fromEnv().sendMorningSummary(
      [TESTARTIKEL],
      { possibleItems: [], jobAds: [] },
    );

    return NextResponse.json({ skickat: true, emailId: result.id, konfiguration });
  } catch (error) {
    return NextResponse.json(
      {
        skickat: false,
        fel: formatErrorMessage(error),
        orsak: formatErrorCause(error),
        konfiguration,
      },
      { status: 502 },
    );
  }
}
