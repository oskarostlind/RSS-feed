"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Uppfångare för fel som inte hanterats någon annanstans.
 *
 * Utan den visar Next.js en engelsk standardsida i produktion, utan väg
 * tillbaka. Sidan säger med flit inte *vad* som gick fel: felmeddelanden från
 * databasen eller en källa kan innehålla anslutningssträngar och nycklar, och
 * det är inget en användare ska se.
 *
 * `digest` däremot visas. Det är en hashad identifierare Next.js sätter i
 * produktion och som går att söka på i Vercels loggar — så en användare som
 * hör av sig kan säga vilket fel det gällde utan att avslöja något.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Ohanterat fel i gränssnittet:", error);
  }, [error]);

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Något gick fel
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Felet är loggat. Dina bevakningar och sparade nyheter är oförändrade —
          det här påverkar bara den här sidan.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Försök igen
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 px-5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Till inkorgen
          </Link>
        </div>

        {error.digest && (
          <p className="mt-6 text-xs text-zinc-400 dark:text-zinc-500">
            Felreferens: <code>{error.digest}</code>
          </p>
        )}
      </main>
    </div>
  );
}
