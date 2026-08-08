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
import {
  loginWithPasswordAction,
  resendVerificationAction,
} from "@/lib/auth/actions";
import { describeAuthFailure, type AuthFailure } from "@/lib/auth/passwordAuth";

/**
 * Inloggning med adress och lösenord.
 *
 * **Magisk länk är borttagen 2026-08-08.** Skälet var konkret: samma dag
 * spärrade Chrome en av tjänstens egna inloggningslänkar som "Farlig
 * webbplats". Formen — ny domän, länk via mejl, lång hex-token, mejladress i
 * klartext och en parameter som pekade vidare till en annan URL — är exakt hur
 * nätfiske ser ut, och mot en klassificerare hjälper inga förklaringar.
 *
 * Med lösenord skickas inget mejl alls vid inloggning. Kvar är verifiering vid
 * registrering och återställning, som båda är sällsynta och bär en länk utan
 * vare sig adress eller vidarepekare.
 */

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<{
    fel?: string;
    nekad?: string;
    verifiering?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  const { fel, nekad, verifiering } = await searchParams;

  return (
    <AuthCard rubrik="Logga in">
      {verifiering ? (
        <AuthNotice>
          Finns det ett obekräftat konto på adressen har vi skickat en ny
          bekräftelselänk.
        </AuthNotice>
      ) : null}

      {/* Registreringsspärren nekade en ny användare. Texten säger med flit
          inte vilket läge som gäller — det är driftinformation, inte något
          besökaren kan agera på. */}
      {nekad ? (
        <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Tjänsten tar just nu inte emot nya konton. Har du redan ett konto
          fungerar inloggningen som vanligt.
        </p>
      ) : null}

      {fel ? <AuthError>{describeAuthFailure(fel as AuthFailure)}</AuthError> : null}

      <form action={loginWithPasswordAction} className="mt-6 space-y-4">
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
          autoComplete="current-password"
        />
        <SubmitButton pendingLabel="Loggar in..." className={AUTH_BUTTON}>
          Logga in
        </SubmitButton>
      </form>

      <div className="mt-4 flex flex-wrap justify-between gap-x-4 gap-y-2 text-sm">
        <AuthFooterLink href="/glomt-losenord">Glömt lösenordet?</AuthFooterLink>
        <AuthFooterLink href="/registrera">Skapa konto</AuthFooterLink>
      </div>

      {/* Visas bara när felet var just "inte bekräftad" — en knapp som alltid
          står framme inbjuder till att mejla adresser som inte bett om något. */}
      {fel === "overifierad" ? (
        <form
          action={resendVerificationAction}
          className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Skicka en ny bekräftelselänk:
          </p>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="namn@foretag.se"
            className="mt-2 block h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <SubmitButton
            pendingLabel="Skickar..."
            className="mt-3 h-10 w-full rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Skicka ny länk
          </SubmitButton>
        </form>
      ) : null}

      <p className="mt-8 text-xs text-zinc-500 dark:text-zinc-400">
        Genom att logga in godtar du att vi behandlar din mejladress och dina
        bevakningar enligt vår{" "}
        <Link href="/integritetspolicy" className="underline underline-offset-4">
          integritetspolicy
        </Link>
        .
      </p>
    </AuthCard>
  );
}
