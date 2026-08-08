import type { ImportPreview } from "@/lib/import/buildImportPreview";
import type { ColumnChoice } from "@/lib/import/sheetShape";

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

export interface SheetChoice {
  index: number;
  name: string;
  rowCount: number;
}

export interface PreviewState {
  status: "idle" | "ready" | "error";
  error: string | null;
  /** Kolumnerna att välja mellan, med rubrik och ett exempelvärde. */
  columns: ColumnChoice[];
  columnIndex: number;
  hasHeaderRow: boolean;
  /**
   * Sant när kolumnen och rubrikraden är tjänstens gissning och inte
   * användarens val. Styr om granskningen ska berätta vad den antog — ett
   * antagande som inte syns går inte att rätta.
   */
  autoDetected: boolean;
  /** Flikar med innehåll. En post för CSV, flera för en Excel-arbetsbok. */
  sheets: SheetChoice[];
  sheetIndex: number;
  preview: ImportPreview | null;
  fileName: string | null;
  /** Rader som inte fick plats i granskningen. Noll i normalfallet. */
  droppedRows: number;
}

export const EMPTY_PREVIEW_STATE: PreviewState = {
  status: "idle",
  error: null,
  columns: [],
  columnIndex: 0,
  hasHeaderRow: true,
  autoDetected: true,
  sheets: [],
  sheetIndex: 0,
  preview: null,
  fileName: null,
  droppedRows: 0,
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
