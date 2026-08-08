import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AUTH_BUTTON,
  AuthCard,
  AuthError,
  AuthField,
  AuthFooterLink,
  AuthNotice,
} from "@/components/AuthCard";
import { SubmitButton } from "@/components/SubmitButton";
import { auth } from "@/lib/auth";
import { registerAction } from "@/lib/auth/actions";
import { describeAuthFailure, type AuthFailure } from "@/lib/auth/passwordAuth";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

/**
 * Registrering med adress och lösenord.
 *
 * Kvittot säger samma sak oavsett om adressen var ny eller redan hade ett
 * konto — se `registerWithPassword` för varför. Det är därför texten talar om
 * "ett mejl" och inte om "ditt nya konto".
 */

export const dynamic = "force-dynamic";

interface RegistreraPageProps {
  searchParams: Promise<{ fel?: string; skickat?: string }>;
}

export default async function RegistreraPage({
  searchParams,
}: RegistreraPageProps) {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  const { fel, skickat } = await searchParams;

  if (skickat) {
    return (
      <AuthCard
        rubrik="Kolla mejlen"
        ingress="Vi har skickat en bekräftelselänk till adressen du angav."
      >
        <AuthNotice>
          Länken gäller i 24 timmar. Klicka på den så är du inloggad direkt.
        </AuthNotice>
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Hittar du inget mejl: kontrollera att adressen stämmer, och titta i
          skräpposten. Har adressen redan ett konto skickade vi i stället en
          länk för att välja nytt lösenord.
        </p>
        <p className="mt-8 text-sm">
          <AuthFooterLink href="/login">Till inloggningen</AuthFooterLink>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      rubrik="Skapa konto"
      ingress="Lägg in bolagen du jobbar mot och få ett mejl varje morgon när något händer hos dem."
    >
      {fel ? (
        <AuthError>{describeAuthFailure(fel as AuthFailure)}</AuthError>
      ) : null}

      <form action={registerAction} className="mt-6 space-y-4">
        <AuthField
          namn="email"
          etikett="E-postadress"
          typ="email"
          autoComplete="email"
          placeholder="namn@foretag.se"
        />
        <AuthField
          namn="losenord"
          etikett="Lösenord"
          typ="password"
          autoComplete="new-password"
          hjalptext={`Minst ${MIN_PASSWORD_LENGTH} tecken. En lösenfras är både säkrare och lättare att minnas.`}
        />
        <AuthField
          namn="losenord2"
          etikett="Upprepa lösenordet"
          typ="password"
          autoComplete="new-password"
        />
        <SubmitButton pendingLabel="Skapar konto..." className={AUTH_BUTTON}>
          Skapa konto
        </SubmitButton>
      </form>

      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        Har du redan ett konto?{" "}
        <AuthFooterLink href="/login">Logga in</AuthFooterLink>
      </p>

      <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
        Genom att skapa ett konto godtar du att vi behandlar din mejladress och
        dina bevakningar enligt vår{" "}
        <Link href="/integritetspolicy" className="underline underline-offset-4">
          integritetspolicy
        </Link>
        .
      </p>
    </AuthCard>
  );
}
