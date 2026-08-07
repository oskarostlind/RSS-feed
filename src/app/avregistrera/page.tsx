import Link from "next/link";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribeToken";
import { confirmUnsubscribeAction } from "./actions";

/**
 * Avregistrering från morgonmejlet, utan inloggning.
 *
 * **Varför sidan bekräftar i stället för att bara göra det:** mejlklienter och
 * företagsbrandväggar förhämtar länkar i mejl för att skanna dem. En GET som
 * avregistrerar direkt skulle därför stänga av mejlet för folk som aldrig
 * klickat, och de skulle upptäcka det först när morgonmejlet uteblev — alltså
 * precis det tysta fel tjänsten redan lider av. Knappen är en POST.
 *
 * Enklicksknappen i Gmail går en annan väg, `/api/avregistrera`. Den är också
 * en POST och förhämtas därför inte heller.
 */

export const dynamic = "force-dynamic";

interface AvregistreraPageProps {
  searchParams: Promise<{
    u?: string;
    t?: string;
    klart?: string;
    fel?: string;
  }>;
}

const KORT =
  "w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-950";

function Ram({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className={KORT}>{children}</main>
    </div>
  );
}

export default async function AvregistreraPage({
  searchParams,
}: AvregistreraPageProps) {
  const { u, t, klart, fel } = await searchParams;

  if (klart) {
    return (
      <Ram>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Morgonmejlet är avslutat
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Du får inga fler morgonmejl. Dina bevakningar ligger kvar och
          nyheterna samlas fortfarande — de syns i dashboarden när du loggar
          in.
        </p>
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Ångrar du dig kan du slå på mejlet igen under{" "}
          <Link
            href="/dashboard/konto"
            className="underline underline-offset-4"
          >
            Konto och data
          </Link>
          .
        </p>
      </Ram>
    );
  }

  if (fel || !u || !verifyUnsubscribeToken(u, t)) {
    return (
      <Ram>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Länken fungerar inte
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Den kan vara avkortad av mejlklienten, eller höra till ett konto som
          inte längre finns. Logga in och stäng av morgonmejlet under Konto och
          data i stället.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Logga in
        </Link>
      </Ram>
    );
  }

  return (
    <Ram>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Avsluta morgonmejlet?
      </h1>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Du slutar få det dagliga mejlet. Kontot och bevakningarna rörs inte —
        nyheterna samlas som vanligt och syns i dashboarden.
      </p>

      <form action={confirmUnsubscribeAction} className="mt-6">
        <input type="hidden" name="u" value={u} />
        <input type="hidden" name="t" value={t ?? ""} />
        <button
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Ja, avsluta morgonmejlet
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Vill du radera hela kontot i stället gör du det under Konto och data.
      </p>
    </Ram>
  );
}
