import Link from "next/link";
import { deleteAccountAction, exportAccountData } from "@/lib/account/actions";
import { auth } from "@/lib/auth";
import { DataExportButton } from "./_components/DataExportButton";

export const dynamic = "force-dynamic";

interface KontoPageProps {
  searchParams: Promise<{ fel?: string }>;
}

const FELMEDDELANDEN: Record<string, string> = {
  bekraftelse: 'Du måste skriva RADERA i rutan för att bekräfta.',
  misslyckades: "Kontot kunde inte raderas. Försök igen.",
};

export default async function KontoPage({ searchParams }: KontoPageProps) {
  const { fel } = await searchParams;
  const session = await auth();
  const data = await exportAccountData();

  const antalBolag = data.bolag.length;
  const antalNyheter = data.bolag.reduce(
    (sum, bolag) => sum + bolag.nyheter.length,
    0,
  );
  const antalAnnonser = data.bolag.reduce(
    (sum, bolag) => sum + bolag.jobbannonser.length,
    0,
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Konto och data
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Inloggad som {session?.user?.email ?? "okänd adress"}.
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          Det här lagrar vi om dig
        </h2>
        <dl className="mt-4 grid grid-cols-3 gap-4">
          {[
            ["Bevakade bolag", antalBolag],
            ["Sparade nyheter", antalNyheter],
            ["Jobbannonser", antalAnnonser],
          ].map(([etikett, antal]) => (
            <div
              key={etikett}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                {etikett}
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {antal}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Utöver detta lagras din mejladress och dina inloggningssessioner.
          Bevakningslistan kan vara affärskänslig — den visar vilka bolag du
          följer — så vi delar den inte med någon.
        </p>
        <DataExportButton />
      </section>

      <section className="mt-12 rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/20">
        <h2 className="text-lg font-medium text-red-900 dark:text-red-200">
          Radera kontot
        </h2>
        <p className="mt-2 text-sm text-red-800 dark:text-red-300">
          Allt raderas direkt och permanent: {antalBolag} bevakningar,{" "}
          {antalNyheter} sparade nyheter, {antalAnnonser} jobbannonser och din
          mejladress. Det går inte att ångra, och vi har ingen säkerhetskopia
          att återställa från.
        </p>

        {fel && FELMEDDELANDEN[fel] && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          >
            {FELMEDDELANDEN[fel]}
          </p>
        )}

        <form action={deleteAccountAction} className="mt-5 flex flex-col gap-3">
          <label
            htmlFor="bekraftelse"
            className="text-sm font-medium text-red-900 dark:text-red-200"
          >
            Skriv RADERA för att bekräfta
          </label>
          <input
            id="bekraftelse"
            name="bekraftelse"
            type="text"
            autoComplete="off"
            required
            className="w-48 rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-red-800 dark:bg-zinc-950 dark:text-zinc-50"
          />
          <button
            type="submit"
            className="w-fit rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800"
          >
            Radera kontot permanent
          </button>
        </form>
      </section>

      <p className="mt-8 text-sm">
        <Link
          href="/dashboard"
          className="text-zinc-500 underline underline-offset-4 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Tillbaka till inkorgen
        </Link>
      </p>
    </main>
  );
}
