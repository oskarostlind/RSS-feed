import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
import {
  buildImportPreview,
  guessNameColumn,
} from "@/lib/import/buildImportPreview";
import { parseCsv } from "@/lib/import/parseCsv";
import { parseXlsx } from "@/lib/import/parseXlsx";
import { SAMPLE_XLSX_BASE64 } from "@/lib/import/sampleXlsx";
import { formatErrorMessage } from "@/lib/utils/formatError";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Självtest för importläsningen. Rör aldrig databasen.
 *
 * Enhetstesterna körs på en utvecklarmaskin; det här körs där koden faktiskt
 * lever. Skillnaden är inte akademisk — `parseXlsx` bygger på `zlib` och
 * cheerio i en serverlös runtime, och den enda delen av tjänsten som inte kan
 * verifieras genom att köra morgonjobbet är just filläsningen.
 *
 * Kontrollerar mot förväntade värden i stället för att bara returnera vad den
 * läste. Ett självtest som bara skriver ut sitt resultat kräver att någon
 * läser det noggrant, och det är precis vad ingen gör kl 05.
 *
 *   GET /api/debug/import-test?secret=<CRON_SECRET>
 */

interface Check {
  name: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
}

function check(name: string, expected: unknown, actual: unknown): Check {
  return {
    name,
    passed: JSON.stringify(expected) === JSON.stringify(actual),
    expected,
    actual,
  };
}

function runXlsxChecks(): Check[] {
  const rows = parseXlsx(Buffer.from(SAMPLE_XLSX_BASE64, "base64"));

  const preview = buildImportPreview({
    rows,
    columnIndex: guessNameColumn(rows[0] ?? []),
    hasHeaderRow: true,
    existingNames: ["Ericsson AB"],
  });

  return [
    check("xlsx: antal rader", 5, rows.length),
    check("xlsx: rubrikrad", ["Kundnr", "Företagsnamn", "Ort"], rows[0]),
    // Rad tre saknar namncell helt i xml:en. Utan positionsåterställning ur
    // cellreferensen skulle "Gävle" glida till kolumn B och bli ett bolagsnamn.
    check("xlsx: tom cell behåller sin plats", ["1002", "", "Gävle"], rows[2]),
    check("xlsx: kolumngissning", 1, guessNameColumn(rows[0] ?? [])),
    check("xlsx: en ny bevakning", 1, preview.counts.ok),
    check(
      "xlsx: Ericsson känns igen trots bolagsform",
      1,
      preview.counts["already-watched"],
    ),
    check("xlsx: summeringsrad sorteras bort", 1, preview.counts.implausible),
  ];
}

function runCsvChecks(): Check[] {
  const rows = parseCsv(
    'Kundnr;Företagsnamn;Ort\n1001;"Peges i Ljusdal AB";Ljusdal\n1002;Peges i Ljusdal;Ljusdal\n',
  );

  const preview = buildImportPreview({
    rows,
    columnIndex: 1,
    hasHeaderRow: true,
    existingNames: [],
  });

  return [
    check("csv: semikolon som avgränsare", 3, rows.length),
    check("csv: citerat fält", "Peges i Ljusdal AB", rows[1][1]),
    check("csv: en ny bevakning", 1, preview.counts.ok),
    check(
      "csv: bolagsform ger inte två bevakningar",
      1,
      preview.counts["duplicate-in-file"],
    ),
  ];
}

export async function GET(request: Request): Promise<NextResponse> {
  const unauthorized = verifyCronSecret(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const checks = [...runXlsxChecks(), ...runCsvChecks()];
    const failed = checks.filter((entry) => !entry.passed);

    return NextResponse.json(
      {
        ranAt: new Date().toISOString(),
        passed: failed.length === 0,
        total: checks.length,
        failedCount: failed.length,
        checks,
      },
      { status: failed.length === 0 ? 200 : 500 },
    );
  } catch (error) {
    return NextResponse.json(
      { passed: false, error: formatErrorMessage(error) },
      { status: 500 },
    );
  }
}
