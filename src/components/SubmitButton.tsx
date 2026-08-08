"use client";

import { useFormStatus } from "react-dom";

/**
 * Skicka-knapp som visar att något faktiskt händer.
 *
 * **Varför det är mer än kosmetika här.** Formulären i tjänsten anropar
 * serverfunktioner som väntar på nätverket: att skicka ett mejl, att söka mot
 * fyra externa källor, att radera ett konto. Utan återkoppling ser en långsam
 * åtgärd exakt ut som en trasig — knappen ser oberörd ut och användaren
 * klickar igen.
 *
 * Och det andra klicket är inte gratis. `deleteCompany`, `addCompany` och
 * `requestEmailChange` kör alla en gång till: en extra bevakning, ett extra
 * bekräftelsemejl. Att stänga knappen medan den väntar är därför både ett
 * besked och en spärr.
 *
 * `useFormStatus` läser tillståndet från det `<form>` knappen sitter i, vilket
 * betyder att den bara fungerar *inuti* formuläret — inte i komponenten som
 * renderar det. Därför en egen liten klientkomponent i stället för att göra
 * varje sida till en klientkomponent för knappens skull.
 */

interface SubmitButtonProps {
  children: React.ReactNode;
  /**
   * Texten medan åtgärden pågår. Utelämnad betyder att etiketten står kvar och
   * bara snurran läggs till — rimligt för korta knappar där en längre text
   * skulle få knappen att hoppa i storlek.
   */
  pendingLabel?: string;
  className?: string;
  /** Sätts av anroparen när knappen ska vara stängd även utan pågående anrop. */
  disabled?: boolean;
}

export function SubmitButton({
  children,
  pendingLabel,
  className,
  disabled,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      // aria-busy och inte bara den ändrade texten: skärmläsare läser inte om
      // en knapp bara för att etiketten bytts, men de annonserar upptaget.
      aria-busy={pending}
      className={`${className ?? ""} inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70`}
    >
      {pending ? (
        <span
          // `border-current` gör att snurran ärver knappens textfärg. Utan det
          // blir den osynlig på de ljusa knapparna i mörkt läge.
          className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : null}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
