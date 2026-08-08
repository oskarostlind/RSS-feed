import {
  classifyNonCompanyValue,
  cleanImportedName,
  companyMatchKey,
} from "@/lib/import/normalizeCompanyName";

/**
 * Gissar formen på det användaren laddade upp: har filen en rubrikrad, vilken
 * kolumn står namnen i, och vilket blad i arbetsboken innehåller listan.
 *
 * **Varför det här är värt egen kod.** Alla tre frågorna hade tidigare ett
 * fast svar — rubrikrad: ja, kolumn: den med rätt rubrikord annars den första,
 * blad: det första. Fasta svar är inte neutrala, de är gissningar som aldrig
 * kan ha fel på ett synligt sätt. En fil utan rubrikrad tappade sitt första
 * bolag tyst, och en fil med kundnummer i kolumn A gav en granskning full av
 * "ser inte ut som ett bolagsnamn" utan att peka på orsaken.
 *
 * Allt här är förslag. Användaren kan ändra varje enskilt val i formuläret, och
 * det är hela poängen: en gissning som syns och går att rätta är något helt
 * annat än ett antagande.
 */

/**
 * Rubrikord vi känner igen. Listan används till två olika saker med olika
 * stränghet — se `headerHintColumn` respektive `detectHeaderRow`.
 */
const HEADER_HINTS = [
  "företagsnamn",
  "bolagsnamn",
  "kundnamn",
  "företag",
  "bolag",
  "kund",
  "klient",
  "leverantör",
  "organisation",
  "company",
  "customer",
  "account",
  "namn",
  "name",
];

/**
 * Vilken kolumn rubriken pekar ut, eller `null` när ingen rubrik matchar.
 *
 * Skillnaden mot att returnera 0 som "vet inte" är hela poängen: den som
 * anropar behöver kunna skilja "rubriken säger kolumn 1" från "ingen aning",
 * eftersom det andra fallet ska avgöras av innehållet i stället.
 */
export function headerHintColumn(headerRow: readonly string[]): number | null {
  const normalized = headerRow.map((cell) => cell.trim().toLowerCase());

  for (const hint of HEADER_HINTS) {
    const exact = normalized.indexOf(hint);

    if (exact !== -1) {
      return exact;
    }
  }

  // Delträff är sämre än exakt men bättre än att gissa kolumn noll: en export
  // med "Kundnamn (juridiskt)" ska hittas.
  for (const hint of HEADER_HINTS) {
    const partial = normalized.findIndex((cell) => cell.includes(hint));

    if (partial !== -1) {
      return partial;
    }
  }

  return null;
}

/**
 * Strängare än `headerHintColumn`: ordet måste stå först i cellen och sluta vid
 * en ordgräns.
 *
 * Skälet är att de två frågorna tål olika mycket fel. Att peka ut fel kolumn
 * kostar ett omval i en meny. Att felaktigt kalla rad 1 för en rubrik **raderar
 * ett bolag ur listan** utan att någonsin visa det. Med `includes` hade
 * "Kundhuset AB" på rad 1 räckt för att tappa bolaget.
 */
const HEADER_WORD_AT_START = new RegExp(`^(${HEADER_HINTS.join("|")})\\b`, "i");

const SAMPLE_ROWS = 200;

/** "AB" på slutet är det starkaste positiva beviset som finns i svenska listor. */
const LEGAL_FORM_AT_END = /\s(ab|hb|kb|aktiebolag|handelsbolag)\.?$/i;

/**
 * Hur mycket en kolumn ser ut som en lista med bolagsnamn.
 *
 * Vikterna är rangordnade, inte kalibrerade: andelen godtagbara namn väger
 * tyngst eftersom den ensam skiljer en namnkolumn från en kolumn med
 * kundnummer. Bolagsformen väger näst tyngst. Unikhet finns med för att skilja
 * namnkolumnen från en ortskolumn, som också består av godtagbara ord men
 * upprepar sig.
 */
function columnScore(values: readonly string[]): number {
  const nonEmpty = values.filter((value) => value.trim().length > 0);

  if (nonEmpty.length === 0) {
    return 0;
  }

  let plausible = 0;
  let legalForm = 0;
  const keys = new Set<string>();

  for (const value of nonEmpty) {
    const cleaned = cleanImportedName(value);

    if (classifyNonCompanyValue(cleaned) === null) {
      plausible += 1;
    }

    if (LEGAL_FORM_AT_END.test(cleaned)) {
      legalForm += 1;
    }

    keys.add(companyMatchKey(cleaned));
  }

  const plausibleShare = plausible / nonEmpty.length;
  const legalShare = legalForm / nonEmpty.length;
  const uniqueShare = keys.size / nonEmpty.length;
  const fillShare = nonEmpty.length / values.length;

  return plausibleShare * 3 + legalShare * 2 + uniqueShare + fillShare * 0.5;
}

/**
 * Är första raden en rubrikrad?
 *
 * Tre signaler, i fallande styrka:
 *
 * 1. Någon cell inleds med ett känt rubrikord. Starkast, och den vanligaste.
 * 2. Rad 1 ser inte ut som ett bolagsnamn i namnkolumnen, men det gör raderna
 *    under. Fångar rubriker vi inte har ord för ("Motpart", "Legal entity").
 * 3. Fyra femtedelar av raderna under slutar på en bolagsform, men inte rad 1.
 *
 * Ordningen är också en prioritering av vilket fel som är billigast. Att missa
 * en rubrik ger en synlig skräprad i granskningen som användaren kan kryssa
 * bort. Att felaktigt utse en rubrik tar bort ett bolag ur listan — därför är
 * de svagare signalerna medvetet trubbiga.
 */
export function detectHeaderRow(rows: readonly string[][]): boolean {
  const first = rows[0];

  if (!first) {
    return false;
  }

  if (first.some((cell) => HEADER_WORD_AT_START.test(cleanImportedName(cell)))) {
    return true;
  }

  // Andra signalen jämför rad 1 med raderna under **i samma kolumn**. Att som
  // tidigare fråga "innehåller rad 1 någon cell som ser ut som ett bolagsnamn"
  // är nästan alltid ja: en rubrikrad med "Ort" eller "Region" i en kolumn
  // räcker för att frågan ska svara fel.
  const column = detectNameColumn(rows, false);
  const firstValue = cleanImportedName(first[column] ?? "");
  const below = rows
    .slice(1, 21)
    .map((row) => cleanImportedName(row[column] ?? ""))
    .filter((value) => value.length > 0);

  if (below.length < 3) {
    return false;
  }

  const plausibleShare =
    below.filter((value) => classifyNonCompanyValue(value) === null).length /
    below.length;

  if (classifyNonCompanyValue(firstValue) !== null && plausibleShare >= 0.6) {
    return true;
  }

  // Bolagsformen som statistik. Att fyra femtedelar av raderna slutar på "AB"
  // men inte rad 1 är ett starkt tecken på att rad 1 är av ett annat slag.
  //
  // Tröskeln är avsiktligt hög. En verklig kundlista blandar alltid in
  // föreningar och enskilda firmor — den fil som avslöjade den här buggen
  // ligger på 66 procent — så 80 procent nås i praktiken bara av listor som
  // verkligen är enhetliga, och där sticker en rubrik ut på riktigt.
  const legalFormShare =
    below.filter((value) => LEGAL_FORM_AT_END.test(value)).length /
    below.length;

  return legalFormShare >= 0.8 && !LEGAL_FORM_AT_END.test(firstValue);
}

export function columnCount(rows: readonly string[][]): number {
  return rows.reduce((widest, row) => Math.max(widest, row.length), 0);
}

/**
 * Vilken kolumn namnen står i.
 *
 * Rubriken vinner när den finns och kolumnen den pekar ut inte är uppenbart
 * sämre än den bäst poängsatta. Skälet är att en rubrik är något användaren
 * själv skrivit — den är en avsikt, inte en observation, och en avsikt ska inte
 * köras över av en heuristik som är marginellt mer övertygad.
 */
export function detectNameColumn(
  rows: readonly string[][],
  hasHeaderRow: boolean,
): number {
  const width = columnCount(rows);

  if (width === 0) {
    return 0;
  }

  const hint = hasHeaderRow && rows[0] ? headerHintColumn(rows[0]) : null;
  const dataRows = (hasHeaderRow ? rows.slice(1) : rows).slice(0, SAMPLE_ROWS);

  if (dataRows.length === 0) {
    return hint ?? 0;
  }

  let best = 0;
  let bestScore = -1;

  for (let column = 0; column < width; column += 1) {
    const score = columnScore(dataRows.map((row) => row[column] ?? ""));

    // Strikt större: vid lika poäng vinner den vänstraste, vilket är den
    // ordning en människa läser filen i.
    if (score > bestScore) {
      best = column;
      bestScore = score;
    }
  }

  if (hint !== null && hint < width) {
    const hintScore = columnScore(dataRows.map((row) => row[hint] ?? ""));

    if (hintScore >= bestScore * 0.6) {
      return hint;
    }
  }

  return best;
}

export interface ColumnChoice {
  index: number;
  /** Rubriken, eller "Kolumn 3" när filen saknar rubrikrad. */
  label: string;
  /** Första ifyllda värdet i kolumnen, så att valet går att göra på syn. */
  sample: string;
}

/**
 * Underlaget till kolumnmenyn.
 *
 * Exemplet är inte pynt. Utan rubrikrad heter alternativen "Kolumn 1", "Kolumn
 * 2", "Kolumn 3" — omöjligt att välja mellan utan att först öppna filen i
 * Excel. Med ett exempelvärde bredvid är valet självklart.
 */
export function buildColumnChoices(
  rows: readonly string[][],
  hasHeaderRow: boolean,
): ColumnChoice[] {
  const width = columnCount(rows);
  const header = hasHeaderRow ? rows[0] : undefined;
  const dataRows = hasHeaderRow ? rows.slice(1) : rows;

  const choices = Array.from({ length: width }, (_unused, index) => {
    const label = cleanImportedName(header?.[index] ?? "");
    const sample =
      dataRows
        .slice(0, 50)
        .map((row) => cleanImportedName(row[index] ?? ""))
        .find((value) => value.length > 0) ?? "";

    return {
      index,
      label: label || `Kolumn ${index + 1}`,
      sample,
      empty: label.length === 0 && sample.length === 0,
    };
  });

  // Excel skriver ofta ut kolumner som råkat bli formaterade men aldrig
  // ifyllda. Att erbjuda "Kolumn 4" till "Kolumn 6" som val när de är tomma är
  // att erbjuda fem sätt att göra fel — men om allt är tomt behålls listan, för
  // en meny utan alternativ är värre än en med dåliga.
  const withContent = choices.filter((choice) => !choice.empty);
  const kept = withContent.length > 0 ? withContent : choices;

  return kept.map(({ index, label, sample }) => ({ index, label, sample }));
}

/**
 * Vilket blad i arbetsboken som innehåller listan.
 *
 * Antalet *godtagbara bolagsnamn* avgör, inte antalet rader. Ett blad med en
 * instruktionstext på tjugo rader ska förlora mot ett blad med tolv bolag, och
 * med radräkning hade det vunnit. En ny arbetsbok i Excel kommer dessutom med
 * tre flikar varav två är tomma — de har redan filtrerats bort innan vi kommer
 * hit.
 */
export function pickBestSheet(
  sheets: readonly { rows: string[][] }[],
): number {
  let best = 0;
  let bestScore = -1;

  sheets.forEach((sheet, index) => {
    const hasHeaderRow = detectHeaderRow(sheet.rows);
    const column = detectNameColumn(sheet.rows, hasHeaderRow);
    const dataRows = hasHeaderRow ? sheet.rows.slice(1) : sheet.rows;

    // Bolagsformen väger dubbelt. Utan den vinner ett blad med fyra rader
    // instruktionstext över ett blad med tre riktiga bolag — prosa består av
    // ord som var för sig ser ut som godtagbara namn.
    const sample = dataRows.slice(0, SAMPLE_ROWS).map((row) => row[column] ?? "");
    const plausible = sample.filter(
      (value) => classifyNonCompanyValue(value) === null,
    ).length;
    const legalForm = sample.filter((value) =>
      LEGAL_FORM_AT_END.test(cleanImportedName(value)),
    ).length;

    const score = plausible + legalForm * 2;

    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });

  return best;
}
