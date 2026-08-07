"use client";

import { useState } from "react";
import { exportAccountData } from "@/lib/account/actions";

/**
 * Dataportabilitet — GDPR artikel 20.
 *
 * Filen byggs i webbläsaren ur server-actionens svar i stället för att gå via
 * en nedladdningsendpoint. Skälet är att en endpoint som svarar med hela
 * kontots innehåll är en yta som måste skyddas separat, och server-actionen
 * har redan sessionskontrollen inbyggd.
 */
export function DataExportButton() {
  const [hamtar, setHamtar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  async function hamtaExport() {
    setHamtar(true);
    setFel(null);

    try {
      const data = await exportAccountData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const lank = document.createElement("a");

      lank.href = url;
      lank.download = `omvarldsbevakare-export-${new Date().toISOString().slice(0, 10)}.json`;
      lank.click();

      // Utan detta lever blobben kvar tills fliken stängs.
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Kunde inte exportera kontodata:", error);
      setFel("Exporten misslyckades. Försök igen.");
    } finally {
      setHamtar(false);
    }
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={hamtaExport}
        disabled={hamtar}
        className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
      >
        {hamtar ? "Hämtar…" : "Ladda ner all min data (JSON)"}
      </button>
      {fel && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {fel}
        </p>
      )}
    </div>
  );
}
