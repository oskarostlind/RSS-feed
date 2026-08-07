"use server";

import { redirect } from "next/navigation";
import { unsubscribeFromMorningEmail } from "@/lib/email/unsubscribe";

/**
 * Bekräftelseknappen på `/avregistrera`.
 *
 * Behörigheten ligger i signaturen i formuläret, inte i en session — se
 * `unsubscribeToken.ts` för varför avregistrering inte får kräva inloggning.
 */
export async function confirmUnsubscribeAction(
  formData: FormData,
): Promise<void> {
  const userId = formData.get("u");
  const token = formData.get("t");

  const result = await unsubscribeFromMorningEmail(
    typeof userId === "string" ? userId : null,
    typeof token === "string" ? token : null,
  );

  // Utfallet i URL:en i stället för i ett tillstånd: sidan är utloggad och
  // engångs, och en omdirigering gör att en omladdning inte skickar om
  // formuläret.
  redirect(result.ok ? "/avregistrera?klart=1" : "/avregistrera?fel=1");
}
