"use server";

import { redirect } from "next/navigation";
import { signIn, signOut } from "@/lib/auth";
import {
  checkLoginRateLimit,
  normalizeIdentifier,
  pruneLoginAttempts,
  recordLoginAttempt,
} from "@/lib/auth/loginRateLimit";
import {
  completeEmailVerification,
  completePasswordReset,
  loginWithPassword,
  registerWithPassword,
  requestPasswordReset,
  resendVerification,
  type AuthFailure,
} from "@/lib/auth/passwordAuth";

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

/**
 * Utfallet läggs i URL:en och inte i ett tillstånd. Sidorna är serverrenderade
 * och en omdirigering gör att en omladdning inte skickar om formuläret —
 * särskilt viktigt här, där ett omskickat formulär betyder ett extra mejl.
 */
function failure(path: string, reason: AuthFailure): never {
  redirect(`${path}?fel=${reason}`);
}

export async function registerAction(formData: FormData): Promise<void> {
  const result = await registerWithPassword(
    formData.get("email"),
    formData.get("losenord"),
    formData.get("losenord2"),
  );

  if (!result.ok) {
    failure("/registrera", result.reason);
  }

  // Kvittot säger inte om adressen var ny eller redan fanns — se
  // `registerWithPassword` för varför.
  redirect("/registrera?skickat=1");
}

export async function loginWithPasswordAction(
  formData: FormData,
): Promise<void> {
  const result = await loginWithPassword(
    formData.get("email"),
    formData.get("losenord"),
  );

  if (!result.ok) {
    failure("/login", result.reason);
  }

  redirect("/dashboard");
}

export async function resendVerificationAction(
  formData: FormData,
): Promise<void> {
  const result = await resendVerification(formData.get("email"));

  if (!result.ok) {
    failure("/login", result.reason);
  }

  redirect("/login?verifiering=skickad");
}

export async function completeEmailVerificationAction(
  formData: FormData,
): Promise<void> {
  const result = await completeEmailVerification(formData.get("t"));

  if (!result.ok) {
    failure("/verifiera", result.reason);
  }

  // Inloggad direkt — den som nått länken har bevisat kontroll över adressen.
  redirect("/dashboard?valkommen=1");
}

export async function requestPasswordResetAction(
  formData: FormData,
): Promise<void> {
  const result = await requestPasswordReset(formData.get("email"));

  if (!result.ok) {
    failure("/glomt-losenord", result.reason);
  }

  redirect("/glomt-losenord?skickat=1");
}

export async function completePasswordResetAction(
  formData: FormData,
): Promise<void> {
  const secret = formData.get("t");
  const result = await completePasswordReset(
    secret,
    formData.get("losenord"),
    formData.get("losenord2"),
  );

  if (!result.ok) {
    // Hemligheten följer med tillbaka så att ett felstavat lösenord inte
    // tvingar fram ett nytt mejl. Den är förbrukad först när den lösts in.
    const suffix =
      typeof secret === "string" && result.reason !== "forbrukad"
        ? `&t=${encodeURIComponent(secret)}`
        : "";
    redirect(`/nytt-losenord?fel=${result.reason}${suffix}`);
  }

  redirect("/dashboard?losenord=bytt");
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
