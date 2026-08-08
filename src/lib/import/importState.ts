import type { ImportPreview } from "@/lib/import/buildImportPreview";

/**
 * Formulärtillstånden för importen — typerna och deras utgångsvärden.
 *
 * **Varför de inte ligger i `actions.ts`.** En fil med `"use server"` får bara
 * exportera asynkrona funktioner. Allt annat som exporteras därifrån blir en
 * pekare klienten kan anropa över nätverket, och eftersom ett objekt inte går
 * att anropa avvisar Next hela modulen — i produktion som ett rått 500 på
 * första knapptrycket, inte som ett byggfel. Konstanterna låg här tidigare och
 * gjorde precis det: hela `/dashboard/companies/import` svarade "Något gick
 * fel" så fort man klickade Granska.
 *
 * Så det här är inte städning. Det är den enda platsen `EMPTY_*` kan bo.
 */

export interface PreviewState {
  status: "idle" | "ready" | "error";
  error: string | null;
  /** Rubrikraden, för kolumnväljaren. */
  headers: string[];
  columnIndex: number;
  hasHeaderRow: boolean;
  preview: ImportPreview | null;
  /** Filens rader, så att kolumnbytet inte kräver att filen laddas upp igen. */
  rows: string[][];
  fileName: string | null;
}

export const EMPTY_PREVIEW_STATE: PreviewState = {
  status: "idle",
  error: null,
  headers: [],
  columnIndex: 0,
  hasHeaderRow: true,
  preview: null,
  rows: [],
  fileName: null,
};

export interface CommitState {
  status: "idle" | "done" | "error";
  created: number;
  skipped: number;
  error: string | null;
}

export const EMPTY_COMMIT_STATE: CommitState = {
  status: "idle",
  created: 0,
  skipped: 0,
  error: null,
};
