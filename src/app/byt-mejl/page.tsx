import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { confirmEmailChangeAction } from "@/lib/account/actions";

/**
 * Bekräftelsesidan för byte av mejladress.
 *
 * **Varför sidan bekräftar i stället för att bara göra det:** mejlklienter och
 * företagsbrandväggar förhämtar länkar för att skanna dem. En GET som bytte
 * adress direkt skulle därför flytta konton för folk som aldrig klickat — och
 * eftersom adressen är inloggningsuppgiften vore det att låsa ute dem. Knappen
 * är en POST, precis som på `/avregistrera` och av samma skäl.
 *
 * Sidan ligger **utanför** `/dashboard` med flit. Den layouten omdirigerar
 * utloggade till inloggningen, och bekräftelsen måste gå att slutföra i
 * telefonens mejlprogram utan att först begära en magisk länk. Behörigheten är
 * signaturen i länken — se `changeEmail.ts` för varför det räcker.
 */

export const dynamic = "force-dynamic";

interface BytMejlPageProps {
  searchParams: Promise<{
    u?: string;
    e?: string;
    x?: string;
    t?: string;
    klart?: string;
    fel?: string;
  }>;
}

const FELTEXTER: Record<string, string> = {
  lank:
    "Länken gäller inte. Antingen har den redan använts, eller så har adressen hunnit ändras sedan mejlet skickades.",
  utgangen:
    "Länken har gått ut. Den är giltig i en timme — begär ett nytt byte från kontosidan.",
  tagen: "Adressen används redan av ett annat konto.",
  fel: "Något gick fel. Försök igen från kontosidan.",
};

const KORT =
  "w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-950";

function Ram({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className={KORT}>{children}</main>
    </div>
  );
}

function TillKontot({ text = "Till kontosidan" }: { text?: string }) {
  return (
    <p className="mt-6 text-sm">
      <Link
        href="/dashboard/konto"
        className="text-zinc-500 underline underline-offset-4 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        {text}
      </Link>
    </p>
  );
}

export default async function BytMejlPage({ searchParams }: BytMejlPageProps) {
  const { u, e, x, t, klart, fel } = await searchParams;

  if (klart) {
    return (
      <Ram>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Adressen är bytt
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Kontot ligger nu på {e ?? "den nya adressen"}. Nästa gång du loggar in
          är det dit inloggningslänken går — den gamla adressen fungerar inte
          längre.
        </p>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Dina bevakningar, nyheter och inställningar är oförändrade.
        </p>
        <TillKontot />
      </Ram>
    );
  }

  if (fel) {
    return (
      <Ram>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Bytet gick inte igenom
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          {FELTEXTER[fel] ?? FELTEXTER.fel}
        </p>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Kontot ligger kvar på din nuvarande adress. Ingenting har ändrats.
        </p>
        <TillKontot text="Försök igen från kontosidan" />
      </Ram>
    );
  }

  // Ofullständig länk hanteras som ett ogiltigt försök och inte som ett
  // tekniskt fel: den vanligaste orsaken är en URL som radbrutits i en
  // mejlklient, och då är rådet detsamma som vid en trasig signatur.
  if (!u || !e || !x || !t) {
    return (
      <Ram>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Länken är ofullständig
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Adressen saknar delar av länken. Det brukar bero på att den brutits i
          mejlprogrammet — prova att kopiera hela länken till adressfältet.
        </p>
        <TillKontot text="Försök igen från kontosidan" />
      </Ram>
    );
  }

  return (
    <Ram>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Bekräfta din nya adress
      </h1>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Kontot flyttas till <span className="font-medium">{e}</span>. Efter det
        går inloggningslänken hit, och den gamla adressen fungerar inte längre.
      </p>

      <form action={confirmEmailChangeAction} className="mt-6">
        <input type="hidden" name="u" value={u} />
        <input type="hidden" name="e" value={e} />
        <input type="hidden" name="x" value={x} />
        <input type="hidden" name="t" value={t} />
        <SubmitButton
          pendingLabel="Byter..."
          className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Byt till den här adressen
        </SubmitButton>
      </form>

      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        Har du inte begärt bytet behöver du inte göra något. Stäng bara sidan —
        ingenting ändras förrän du klickar.
      </p>
    </Ram>
  );
}
