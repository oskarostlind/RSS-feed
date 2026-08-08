"use client";

import { useEffect, useRef, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { approveAllPendingNewsItems } from "@/lib/news/actions";

interface ReadAllButtonProps {
  /** Antalet väntande nyheter — används i bekräftelsetexten. */
  count: number;
}

/**
 * "Läs alla" — godkänner hela inkorgen i ett svep.
 *
 * **Varför ett bekräftelsesteg och inte bara en knapp.** Åtgärden går inte att
 * ångra: en morgons hela skörd byter status på en gång, och en felträff intill
 * "Godkänn" på det översta kortet hade tömt listan utan att användaren hann
 * läsa vad som försvann. Bekräftelsen kostar ett extra klick den dag man
 * verkligen vill tömma, och räddar den dag man inte ville det.
 *
 * **Varför inline och inte `window.confirm`.** Webbläsarens dialog blockerar
 * hela fliken, ser ut som ett systemfel och går inte att formge — och antalet
 * nyheter, som är hela poängen med frågan, syns bättre i tjänstens eget språk.
 */
export function ReadAllButton({ count }: ReadAllButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Ref på formuläret och inte på knappen: `SubmitButton` är en egen komponent
  // som inte skickar vidare någon ref, och att bygga om den bara för fokus vore
  // att låta det här kortet bestämma över en knapp resten av tjänsten delar.
  const confirmFormRef = useRef<HTMLFormElement>(null);

  // Fokus måste flyttas manuellt: knappen som hade fokus försvinner ur DOM när
  // läget byts, och då hamnar fokus på <body> — tangentbordsanvändaren tappar
  // sin plats mitt i ett beslut.
  useEffect(() => {
    if (confirming) {
      confirmFormRef.current?.querySelector("button")?.focus();
    }
  }, [confirming]);

  function avbryt(): void {
    setConfirming(false);
    triggerRef.current?.focus();
  }

  if (count === 0) {
    return null;
  }

  if (!confirming) {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        Läs alla
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Bekräfta att alla nyheter ska godkännas"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          avbryt();
        }
      }}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/40"
    >
      <span className="text-sm text-amber-900 dark:text-amber-100">
        Godkänn alla {count} nyheter?
      </span>
      <form ref={confirmFormRef} action={approveAllPendingNewsItems}>
        <SubmitButton
          pendingLabel="Godkänner…"
          className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          Ja, godkänn alla
        </SubmitButton>
      </form>
      <button
        type="button"
        onClick={avbryt}
        className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-white/60 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        Avbryt
      </button>
    </div>
  );
}
