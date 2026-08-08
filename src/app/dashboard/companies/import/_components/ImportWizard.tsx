"use client";

import Link from "next/link";
import { useActionState } from "react";
import { commitImport, previewImport } from "@/lib/import/actions";
import type { ImportRow, ImportRowStatus } from "@/lib/import/buildImportPreview";
import {
  EMPTY_COMMIT_STATE,
  EMPTY_PREVIEW_STATE,
} from "@/lib/import/importState";

/**
 * Två formulär, inte ett flerstegsflöde med eget tillstånd.
 *
 * Förhandsgranskningen är ren utdata från servern, så all information som
 * behövs för nästa steg — raderna, kolumnvalet — skickas med som dolda fält.
 * Det gör att ett kolumnbyte inte kräver ny uppladdning, och att ett omladdat
 * fönster inte lämnar en halvfärdig import i ett tillstånd ingen kan se.
 */

const STATUS_STYLES: Record<ImportRowStatus, string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  empty: "text-zinc-400 dark:text-zinc-500",
  implausible: "text-amber-700 dark:text-amber-400",
  "duplicate-in-file": "text-amber-700 dark:text-amber-400",
  "already-watched": "text-zinc-500 dark:text-zinc-400",
};

const STATUS_LABELS: Record<ImportRowStatus, string> = {
  ok: "Importeras",
  empty: "Tom",
  implausible: "Ej bolagsnamn",
  "duplicate-in-file": "Dubblett i filen",
  "already-watched": "Bevakas redan",
};

/**
 * Rader som inte importeras visas först.
 *
 * En lista på 150 rader där de 145 lyckade ligger överst gör att de fem
 * problematiska aldrig blir lästa — och de fem är hela skälet till att
 * granskningen finns.
 */
function sortForReview(rows: ImportRow[]): ImportRow[] {
  return [...rows].sort((a, b) => {
    const aOk = a.status === "ok" ? 1 : 0;
    const bOk = b.status === "ok" ? 1 : 0;

    return aOk !== bOk ? aOk - bOk : a.lineNumber - b.lineNumber;
  });
}

export function ImportWizard() {
  const [preview, previewAction, previewPending] = useActionState(
    previewImport,
    EMPTY_PREVIEW_STATE,
  );
  const [commit, commitAction, commitPending] = useActionState(
    commitImport,
    EMPTY_COMMIT_STATE,
  );

  if (commit.status === "done") {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Importen är klar
        </h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          {commit.created} bolag lades till
          {commit.skipped > 0 ? `, ${commit.skipped} hoppades över` : ""}.
        </p>

        {/* Importen lyckades, men något föll bort. Ett besked som inte är ett
            felmeddelande, eftersom inget gick fel. */}
        {commit.error ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {commit.error}
          </p>
        ) : null}
        <Link
          href="/dashboard/companies"
          className="inline-block rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Till bevakningarna
        </Link>
      </section>
    );
  }

  const rows = preview.preview?.rows ?? [];
  const counts = preview.preview?.counts;
  const importable = preview.preview?.importable ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Välj fil
        </h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Excel (.xlsx) eller CSV. Inget sparas förrän du bekräftat listan.
        </p>

        {preview.status === "error" && preview.error ? (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            {preview.error}
          </p>
        ) : null}

        <form action={previewAction} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Fil
            </span>
            <input
              type="file"
              name="file"
              accept=".xlsx,.csv,.tsv,.txt"
              required
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 file:mr-4 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:file:bg-zinc-800 dark:file:text-zinc-200"
            />
          </label>
          <button
            type="submit"
            disabled={previewPending}
            className="h-[42px] rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {previewPending ? "Läser…" : "Granska"}
          </button>
        </form>
      </section>

      {preview.status === "ready" && preview.preview ? (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Vilken kolumn innehåller bolagsnamnet?
            </h2>

            <form action={previewAction} className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <input type="hidden" name="rows" value={JSON.stringify(preview.rows)} />
              <input type="hidden" name="fileName" value={preview.fileName ?? ""} />
              {/* Talar om att kryssrutan nedan finns, så att servern kan
                  skilja "urkryssad" från "fältet skickades inte". */}
              <input type="hidden" name="hasHeaderRowPresent" value="1" />

              <label className="flex flex-1 flex-col gap-1.5">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Kolumn
                </span>
                <select
                  name="columnIndex"
                  defaultValue={preview.columnIndex}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  {preview.headers.map((header, index) => (
                    <option key={index} value={index}>
                      {header.trim() || `Kolumn ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 pb-3 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  name="hasHeaderRow"
                  value="true"
                  defaultChecked={preview.hasHeaderRow}
                  className="size-4"
                />
                Första raden är rubriker
              </label>

              <button
                type="submit"
                disabled={previewPending}
                className="h-[42px] rounded-lg border border-zinc-300 px-6 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Uppdatera
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Granska
            </h2>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              {counts?.ok ?? 0} nya bevakningar av {rows.length} rader.
              {counts && counts["already-watched"] > 0
                ? ` ${counts["already-watched"]} bevakas redan.`
                : ""}
              {counts && counts["duplicate-in-file"] > 0
                ? ` ${counts["duplicate-in-file"]} är dubbletter i filen.`
                : ""}
              {counts && counts.implausible > 0
                ? ` ${counts.implausible} ser inte ut som bolagsnamn.`
                : ""}
            </p>

            <div className="mb-6 max-h-96 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Rad</th>
                    <th className="px-4 py-2 font-medium">Namn</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortForReview(rows).map((row) => (
                    <tr
                      key={row.lineNumber}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="px-4 py-2 text-zinc-400 dark:text-zinc-500">
                        {row.lineNumber}
                      </td>
                      <td className="px-4 py-2 text-zinc-900 dark:text-zinc-100">
                        {row.name || <span className="text-zinc-400">—</span>}
                      </td>
                      <td className={`px-4 py-2 ${STATUS_STYLES[row.status]}`}>
                        {STATUS_LABELS[row.status]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {commit.status === "error" && commit.error ? (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
              >
                {commit.error}
              </p>
            ) : null}

            <form action={commitAction}>
              <input
                type="hidden"
                name="names"
                value={JSON.stringify(importable.map((row) => row.name))}
              />
              <button
                type="submit"
                disabled={commitPending || importable.length === 0}
                className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {commitPending
                  ? "Importerar…"
                  : `Importera ${importable.length} bolag`}
              </button>
            </form>
          </section>
        </>
      ) : null}
    </div>
  );
}
