import {
  AUTH_BUTTON,
  AuthCard,
  AuthError,
  AuthField,
  AuthFooterLink,
  AuthNotice,
} from "@/components/AuthCard";
import { SubmitButton } from "@/components/SubmitButton";
import { requestPasswordResetAction } from "@/lib/auth/actions";
import { describeAuthFailure, type AuthFailure } from "@/lib/auth/passwordAuth";

/**
 * Begär återställning.
 *
 * Kvittot är detsamma oavsett om adressen har ett konto eller inte. Ett
 * formulär som säger "adressen finns inte" är en tjänst som berättar vilka som
 * är kunder här — och i den här tjänsten avslöjar det dessutom indirekt vilka
 * bolag någon bevakar.
 */

export const dynamic = "force-dynamic";

interface GlomtPageProps {
  searchParams: Promise<{ fel?: string; skickat?: string }>;
}

export default async function GlomtLosenordPage({
  searchParams,
}: GlomtPageProps) {
  const { fel, skickat } = await searchParams;

  if (skickat) {
    return (
      <AuthCard rubrik="Kolla mejlen">
        <AuthNotice>
          Finns det ett konto på adressen har vi skickat en länk för att välja
          nytt lösenord. Den gäller i en timme.
        </AuthNotice>
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Titta i skräpposten om det dröjer. Begär du flera mejl är det bara det
          senaste som fungerar.
        </p>
        <p className="mt-8 text-sm">
          <AuthFooterLink href="/login">Till inloggningen</AuthFooterLink>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      rubrik="Glömt lösenordet"
      ingress="Skriv in din adress så skickar vi en länk för att välja ett nytt."
    >
      {fel ? (
        <AuthError>{describeAuthFailure(fel as AuthFailure)}</AuthError>
      ) : null}

      <form action={requestPasswordResetAction} className="mt-6 space-y-4">
        <AuthField
          namn="email"
          etikett="E-postadress"
          typ="email"
          autoComplete="email"
          placeholder="namn@foretag.se"
        />
        <SubmitButton pendingLabel="Skickar..." className={AUTH_BUTTON}>
          Skicka återställningslänk
        </SubmitButton>
      </form>

      <p className="mt-6 text-sm">
        <AuthFooterLink href="/login">Tillbaka till inloggningen</AuthFooterLink>
      </p>
    </AuthCard>
  );
}
