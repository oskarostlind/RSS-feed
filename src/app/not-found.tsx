import Link from "next/link";

/**
 * Utan den här filen visar Next.js sin egen 404 — på engelska, osvept, utan
 * väg tillbaka. Det är den sida en användare mest sannolikt möter av misstag,
 * till exempel genom en gammal länk i ett morgonmejl till ett bolag som
 * hunnit tas bort.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          404
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Sidan finns inte
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Länken kan vara gammal, eller så har bevakningen tagits bort.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Till inkorgen
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 px-5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Startsidan
          </Link>
        </div>
      </main>
    </div>
  );
}
