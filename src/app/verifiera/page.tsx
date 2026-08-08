import {
  AUTH_BUTTON,
  AuthCard,
  AuthError,
  AuthFooterLink,
} from "@/components/AuthCard";
import { SubmitButton } from "@/components/SubmitButton";
import { completeEmailVerificationAction } from "@/lib/auth/actions";
import { describeAuthFailure, type AuthFailure } from "@/lib/auth/passwordAuth";

/**
 * Bekräftelsesidan för en ny adress.
 *
 * **Knappen är en POST, och det är inte artighet.** Mejlklienter och
 * säkerhetsskannrar förhämtar länkar för att kontrollera dem. En GET som löste
 * in token direkt hade förbrukat länken innan användaren hunnit klicka — och
 * eftersom länken är engångs hade hen mötts av "redan använd" på sitt första
 * försök. Samma skäl som på `/avregistrera`.
 */

export const dynamic = "force-dynamic";

interface VerifieraPageProps {
  searchParams: Promise<{ t?: string; fel?: string }>;
}

export default async function VerifieraPage({
  searchParams,
}: VerifieraPageProps) {
  const { t, fel } = await searchParams;

  if (fel) {
    return (
      <AuthCard rubrik="Länken fungerade inte">
        <AuthError>{describeAuthFailure(fel as AuthFailure)}</AuthError>
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Du kan begära ett nytt bekräftelsemejl från inloggningssidan.
        </p>
        <p className="mt-6 text-sm">
          <AuthFooterLink href="/login">Till inloggningen</AuthFooterLink>
        </p>
      </AuthCard>
    );
  }

  if (!t) {
    return (
      <AuthCard rubrik="Länken är ofullständig">
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Adressen saknar den del som identifierar din bekräftelse. Det brukar
          bero på att länken brutits i mejlprogrammet — prova att kopiera hela
          adressen till adressfältet.
        </p>
        <p className="mt-6 text-sm">
          <AuthFooterLink href="/login">Till inloggningen</AuthFooterLink>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      rubrik="Bekräfta din adress"
      ingress="Ett klick till, så är kontot aktivt och du är inloggad."
    >
      <form action={completeEmailVerificationAction} className="mt-6">
        <input type="hidden" name="t" value={t} />
        <SubmitButton pendingLabel="Bekräftar..." className={AUTH_BUTTON}>
          Bekräfta och logga in
        </SubmitButton>
      </form>
      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        Har du inte skapat något konto behöver du inte göra något. Stäng bara
        sidan — ingenting aktiveras förrän du klickar.
      </p>
    </AuthCard>
  );
}
