"use server";

import { redirect } from "next/navigation";
import { signIn, signOut } from "@/lib/auth";

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

  try {
    await signIn("email", {
      email: email.trim().toLowerCase(),
      redirect: false,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    console.error("Failed to send magic link:", error);
    redirect("/login?fel=1");
  }

  redirect("/login?skickat=1");
}
