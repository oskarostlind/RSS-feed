import { NextResponse } from "next/server";
import { unsubscribeFromMorningEmail } from "@/lib/email/unsubscribe";

/**
 * Enklicksavregistrering enligt RFC 8058.
 *
 * Gmail och Outlook visar en egen avregistreringsknapp vid avsändarnamnet när
 * mejlet bär `List-Unsubscribe-Post`. Klickar mottagaren där skickar klienten en
 * POST hit och förväntar sig 200 — ingen sida, ingen bekräftelse. Att svara med
 * en HTML-sida eller en omdirigering räknas som misslyckande av vissa klienter.
 *
 * **Varför det här är en POST och bekräftelsesidan en GET:** mejlklienter och
 * säkerhetsskannrar förhämtar länkar i bakgrunden. En GET som avregistrerar
 * direkt skulle alltså stänga av morgonmejlet för folk som aldrig klickat. POST
 * förhämtas inte.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;

  const result = await unsubscribeFromMorningEmail(
    params.get("u"),
    params.get("t"),
  );

  if (!result.ok) {
    // 400 även för okänd användare: att skilja på "fel signatur" och "finns
    // inte" i svaret vore ett sätt att testa vilka användar-id som existerar.
    const status = result.reason === "failed" ? 500 : 400;
    return NextResponse.json({ ok: false }, { status });
  }

  return NextResponse.json({ ok: true });
}
