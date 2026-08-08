"use server";

import { redirect } from "next/navigation";
import { destroyUserSession } from "@/lib/auth/session";
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
  await destroyUserSession();
  redirect("/");
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
