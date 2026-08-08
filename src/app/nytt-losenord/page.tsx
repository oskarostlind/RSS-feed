import {
  AUTH_BUTTON,
  AuthCard,
  AuthError,
  AuthField,
  AuthFooterLink,
} from "@/components/AuthCard";
import { SubmitButton } from "@/components/SubmitButton";
import { completePasswordResetAction } from "@/lib/auth/actions";
import { describeAuthFailure, type AuthFailure } from "@/lib/auth/passwordAuth";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

/**
 * Välj nytt lösenord efter en återställningslänk.
 *
 * Länken löses in först när formuläret skickas, inte när sidan öppnas. Det är
 * skillnaden som gör att en förhämtning från en mejlklient inte bränner
 * länken, och att ett felstavat lösenord går att rätta utan ett nytt mejl.
 *
 * Att lyckas här loggar ut alla andra sessioner — se `completePasswordReset`.
 */

export const dynamic = "force-dynamic";

interface NyttLosenordPageProps {
  searchParams: Promise<{ t?: string; fel?: string }>;
}

export default async function NyttLosenordPage({
  searchParams,
}: NyttLosenordPageProps) {
  const { t, fel } = await searchParams;

  if (!t) {
    return (
      <AuthCard rubrik="Länken är ofullständig">
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Adressen saknar den del som identifierar din återställning. Prova att
          kopiera hela länken från mejlet, eller begär en ny.
        </p>
        <p className="mt-6 text-sm">
          <AuthFooterLink href="/glomt-losenord">
            Begär en ny länk
          </AuthFooterLink>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      rubrik="Välj nytt lösenord"
      ingress="När du sparat loggas du in här, och alla andra enheter loggas ut."
    >
      {fel ? (
        <AuthError>{describeAuthFailure(fel as AuthFailure)}</AuthError>
      ) : null}

      <form action={completePasswordResetAction} className="mt-6 space-y-4">
        <input type="hidden" name="t" value={t} />
        <AuthField
          namn="losenord"
          etikett="Nytt lösenord"
          typ="password"
          autoComplete="new-password"
          hjalptext={`Minst ${MIN_PASSWORD_LENGTH} tecken.`}
        />
        <AuthField
          namn="losenord2"
          etikett="Upprepa lösenordet"
          typ="password"
          autoComplete="new-password"
        />
        <SubmitButton pendingLabel="Sparar..." className={AUTH_BUTTON}>
          Spara och logga in
        </SubmitButton>
      </form>

      <p className="mt-6 text-sm">
        <AuthFooterLink href="/glomt-losenord">Begär en ny länk</AuthFooterLink>
      </p>
    </AuthCard>
  );
}
