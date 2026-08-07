"use server";

import { redirect } from "next/navigation";
import { signIn, signOut } from "@/lib/auth";
import {
  checkLoginRateLimit,
  normalizeIdentifier,
  pruneLoginAttempts,
  recordLoginAttempt,
} from "@/lib/auth/loginRateLimit";

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

/**
 * Skickar en magisk länk från vår egen inloggningssida.
 *
 * `redirect: false` är avsiktligt: Auth.js vill annars skicka användaren till
 * sin inbyggda "verify request"-sida, och vi vill hålla kvar hen på `/login`
 * med ett svenskt kvitto. Felet fångas här i stället för att slå upp som en
 * ohanterad krasch — en felstavad adress ska ge ett meddelande, inte en vit
 * sida.
 */
export async function requestMagicLinkAction(
  formData: FormData,
): Promise<void> {
  const email = formData.get("email");

  if (typeof email !== "string" || !email.includes("@")) {
    redirect("/login?fel=1");
  }

  const identifier = normalizeIdentifier(email);
  const verdict = await checkLoginRateLimit(identifier);

  if (!verdict.allowed) {
    if (verdict.reason === "global") {
      // Ett driftläge, inte något användaren gjort. Här är ett ärligt besked
      // bättre än ett kvitto på ett mejl som aldrig skickas.
      console.error(
        "Globalt tak för inloggningsmejl nått — misstänkt missbruk eller ovanlig belastning.",
      );
      redirect("/login?fel=belastning");
    }

    // Taket per adress ger **samma kvitto som vid framgång**, med flit.
    //
    // Två skäl. Den som spammar någon annans adress ska inte få veta att
    // spärren finns och börja rotera adresser. Och den som träffas legitimt
    // har redan fått fem mejl den senaste timmen — ett av dem fungerar, så
    // rätt råd är "titta i inkorgen", inte "försök igen".
    console.warn(`Tak för inloggningsmejl nått för en adress.`);
    redirect("/login?skickat=1");
  }

  await recordLoginAttempt(identifier);

  try {
    await signIn("email", {
      email: identifier,
      redirect: false,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    console.error("Failed to send magic link:", error);
    redirect("/login?fel=1");
  }

  // Efter utskicket, inte före: städningen får aldrig fördröja mejlet.
  await pruneLoginAttempts();

  redirect("/login?skickat=1");
}
