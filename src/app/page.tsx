import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Omvärldsbevakare
        </h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          MVP för proaktiv bevakning av företagsomnämnanden i svensk nyhetsmedia.
        </p>
        <Link
          href="/dashboard"
          className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Öppna inkorgen
        </Link>
      </main>
    </div>
  );
}
