"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";
import { commitImport, previewImport } from "@/lib/import/actions";
import type { ImportRow, ImportRowStatus } from "@/lib/import/buildImportPreview";
import {
  EMPTY_COMMIT_STATE,
  EMPTY_PREVIEW_STATE,
} from "@/lib/import/importState";

/**
 * Ett formulär för filen och formvalen, ett för själva importen.
 *
 * Filen skickas med varje gång användaren ändrar blad, kolumn eller
 * rubrikinställning. Det ersätter en tidigare lösning där hela rutnätet skickades
 * fram och tillbaka som JSON i ett dolt fält — se `previewImport` för varför den
 * vägen gick sönder precis för de största filerna.
 *
 * **Varför filen också hålls i React-tillstånd.** React nollställer ett
 * okontrollerat formulär när dess åtgärd är klar. För ett textfält är det
 * hjälpsamt; för ett filfält betyder det att valet är borta efter första
 * granskningen, och nästa "Uppdatera" hade skickat en tom begäran och svarat
 * "Välj en fil att importera" på en fil användaren tydligt redan valt. Därför
 * fångas `File`-objektet vid valet och läggs tillbaka i formulärdatan innan
 * åtgärden anropas.
 *
 * Allt tjänsten gissat syns som ifyllda kontroller användaren kan ändra. En
 * gissning som inte går att se går inte att rätta, och det är hela skillnaden
 * mellan ett förslag och ett antagande.
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

/**
 * Bara bedömningen "ser inte ut som ett bolagsnamn" går att köra över.
 *
 * De andra avslagen är inte bedömningar utan fakta: en tom cell har inget namn,
 * och en dubblett skulle ändå tas bort på servern. Att erbjuda en kryssruta som
 * inte gör något vore värre än att inte erbjuda någon.
 */
function isForcible(row: ImportRow): boolean {
  return row.status === "implausible" && row.name.length > 0;
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

  /** Rader användaren tagit med trots att de sorterats bort, per radnummer. */
  const [forced, setForced] = useState<ReadonlySet<number>>(new Set());
  /** Den valda filen, som överlever att formuläret nollställs. */
  const [file, setFile] = useState<File | null>(null);

  // Radnumren betyder något helt annat efter ett blad- eller kolumnbyte. Att
  // behålla kryssen då hade tagit med rader användaren aldrig tittat på.
  const shapeKey = `${preview.fileName}|${preview.sheetIndex}|${preview.columnIndex}|${preview.hasHeaderRow}`;

  useEffect(() => {
    setForced(new Set());
  }, [shapeKey]);

  const rows = useMemo(() => preview.preview?.rows ?? [], [preview.preview]);
  const counts = preview.preview?.counts;
  const importable = preview.preview?.importable ?? [];

  const namesToImport = useMemo(() => {
    const forcedNames = rows
      .filter((row) => isForcible(row) && forced.has(row.lineNumber))
      .map((row) => row.name);

    return [...importable.map((row) => row.name), ...forcedNames];
  }, [rows, importable, forced]);

  function submitPreview(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const chosen = data.get("file");

    if (chosen instanceof File && chosen.size > 0) {
      setFile(chosen);
    } else if (file) {
      data.set("file", file);
    }

    startTransition(() => previewAction(data));
  }

  function toggleForced(lineNumber: number): void {
    setForced((current) => {
      const next = new Set(current);

      if (!next.delete(lineNumber)) {
        next.add(lineNumber);
      }

      return next;
    });
  }

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

  const ready = preview.status === "ready" && preview.preview !== null;

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

        {/* Ett enda formulär för filen och formvalen, så att varje ändring
            nedan kan läsa om filen utan att användaren väljer den på nytt. */}
        <form onSubmit={submitPreview} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Fil
            </span>
            <input
              type="file"
              name="file"
              accept=".xlsx,.csv,.tsv,.txt"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 file:mr-4 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:file:bg-zinc-800 dark:file:text-zinc-200"
            />
            {/* Filfältet kan se tomt ut efter en nollställning trots att filen
                finns kvar. Namnet under är beviset på att den gör det. */}
            {file ? (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Vald fil: {file.name}
              </span>
            ) : null}
          </label>

          {ready ? (
            <>
              {/* Talar om att kryssrutan nedan finns, så att servern kan skilja
                  "urkryssad" från "fältet skickades inte". */}
              <input type="hidden" name="hasHeaderRowPresent" value="1" />
              {/* Vilket blad valen nedan gjordes för. Skiljer det sig från det
                  valda bladet gissar servern om i stället för att tillämpa ett
                  kolumnval som betydde något annat. */}
              <input
                type="hidden"
                name="renderedSheetIndex"
                value={preview.sheetIndex}
              />

              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                {preview.sheets.length > 1 ? (
                  <label className="flex flex-col gap-1.5 sm:w-56">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Blad
                    </span>
                    <select
                      name="sheetIndex"
                      defaultValue={preview.sheetIndex}
                      key={`sheet-${preview.sheetIndex}`}
                      className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    >
                      {preview.sheets.map((sheet) => (
                        <option key={sheet.index} value={sheet.index}>
                          {sheet.name} ({sheet.rowCount} rader)
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Kolumn med bolagsnamn
                  </span>
                  <select
                    name="columnIndex"
                    defaultValue={preview.columnIndex}
                    key={`column-${preview.sheetIndex}-${preview.columnIndex}`}
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  >
                    {preview.columns.map((column) => (
                      <option key={column.index} value={column.index}>
                        {column.label}
                        {column.sample ? ` — t.ex. ${column.sample}` : ""}
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
                    key={`header-${preview.sheetIndex}-${String(preview.hasHeaderRow)}`}
                    className="size-4"
                  />
                  Första raden är rubriker
                </label>
              </div>
            </>
          ) : null}

          <div>
            <button
              type="submit"
              disabled={previewPending || file === null}
              className="h-[42px] rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {previewPending ? "Läser…" : ready ? "Uppdatera" : "Granska"}
            </button>
          </div>
        </form>
      </section>

      {ready ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Granska
          </h2>
          <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
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

          {/* Gissningarna sägs rakt ut. Den som ser "Kolumn 1" och 120 avslag
              ska förstå att det är kolumnvalet som är fel, inte filen. */}
          {preview.autoDetected ? (
            <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">
              Vi läser{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-200">
                {preview.columns.find(
                  (column) => column.index === preview.columnIndex,
                )?.label ?? `kolumn ${preview.columnIndex + 1}`}
              </span>
              {preview.sheets.length > 1
                ? ` i bladet ${
                    preview.sheets.find(
                      (sheet) => sheet.index === preview.sheetIndex,
                    )?.name ?? ""
                  }`
                : ""}
              {preview.hasHeaderRow
                ? " och hoppar över första raden som rubrik."
                : " och tolkar första raden som ett bolag."}{" "}
              Stämmer det inte, ändra ovan.
            </p>
          ) : null}

          {preview.droppedRows > 0 ? (
            <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Filen har fler rader än granskningen visar. De {preview.droppedRows}{" "}
              sista raderna kommer inte med — dela upp filen om du behöver dem.
            </p>
          ) : null}

          <div className="mb-6 mt-4 max-h-96 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Rad</th>
                  <th className="px-4 py-2 font-medium">Namn</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Ta med ändå</th>
                </tr>
              </thead>
              <tbody>
                {sortForReview(rows).map((row) => {
                  const isForced = forced.has(row.lineNumber);

                  return (
                    <tr
                      key={row.lineNumber}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="px-4 py-2 align-top text-zinc-400 dark:text-zinc-500">
                        {row.lineNumber}
                      </td>
                      <td className="px-4 py-2 align-top text-zinc-900 dark:text-zinc-100">
                        {row.name || <span className="text-zinc-400">—</span>}
                      </td>
                      <td className="px-4 py-2 align-top">
                        <span
                          className={
                            isForced
                              ? "text-emerald-700 dark:text-emerald-400"
                              : STATUS_STYLES[row.status]
                          }
                        >
                          {isForced ? "Importeras" : STATUS_LABELS[row.status]}
                        </span>
                        {row.status !== "ok" ? (
                          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                            {row.reason}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 align-top">
                        {isForcible(row) ? (
                          <input
                            type="checkbox"
                            checked={isForced}
                            onChange={() => toggleForced(row.lineNumber)}
                            aria-label={`Importera ${row.name} ändå`}
                            className="size-4"
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
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
              value={JSON.stringify(namesToImport)}
            />
            <button
              type="submit"
              disabled={commitPending || namesToImport.length === 0}
              className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {commitPending
                ? "Importerar…"
                : `Importera ${namesToImport.length} bolag`}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
