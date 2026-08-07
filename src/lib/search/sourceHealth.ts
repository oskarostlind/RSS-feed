/**
 * Larm när en källa tystnar.
 *
 * Det farliga felet i den här tjänsten är inte att en källa kastar fel — det
 * syns i loggen och fångas av `collectSafely`. Det farliga är att den svarar
 * HTTP 200 med noll poster. Det hände google-rss 2026-08-07: nio sekunders
 * svarstid, inget fel, noll träffar, och nästa anrop gav de tolv förväntade
 * igen. Bing täckte upp, så mejlet såg friskt ut.
 *
 * **En tyst nolla ser ut som "inga nyheter".** Händer det kl 07 uteblir mejlet
 * utan att någon får veta att bevakningen låg nere.
 *
 * Larmet härleds ur körningen som redan gjorts i stället för att kosta egna
 * anrop mot ett referensbolag. Det har två fördelar: det mäter vad som faktiskt
 * hände för användarens riktiga portfölj, och det kan inte själv gå sönder på
 * ett sätt som gör larmet tyst.
 */

export type SourceLabel = "google-rss" | "bing-rss" | "gnews" | "jobtech";

export interface SourceTally {
  source: SourceLabel;
  /** Antal bolag där källan kördes. */
  companiesQueried: number;
  /** Antal bolag där källan gav minst en träff. */
  companiesWithHits: number;
  totalHits: number;
  /** Antal bolag där källan kastade fel. */
  failures: number;
  /**
   * Antal bolag där källan svarade 429. Räknas separat från `failures`: en
   * strypt källa fungerar, vi frågar bara för fort. Slås de ihop larmar en
   * kvotgräns som om tjänsten vore nere.
   */
  throttled: number;
}

export type SourceVerdict =
  | "healthy"
  /** Noll träffar över hela portföljen medan andra källor levererade. */
  | "silent"
  /** Kastade fel för minst hälften av bolagen. */
  | "failing"
  /** Svarade 429. Källan lever, vi frågar för fort. */
  | "throttled"
  /** Kördes inte, eller kördes bara mot bolag som ingen källa hittade något om. */
  | "inconclusive";

export interface SourceHealth extends SourceTally {
  verdict: SourceVerdict;
  note: string;
}

/**
 * GNews ger noll på svensk lokalpress som normaltillstånd — mätning 2026-08-06
 * på Peges gav noll trots fyra publicerade artiklar. Att larma om det vore att
 * larma varje morgon, och ett larm som alltid går ignoreras.
 *
 * Jobbannonser är inte heller ett larmfall: ett bolag som inte rekryterar just
 * nu ger noll helt korrekt, och det är det vanliga.
 */
const SOURCES_EXEMPT_FROM_SILENCE: readonly SourceLabel[] = [
  "gnews",
  "jobtech",
] as const;

function judge(tally: SourceTally, portfolioHadHits: boolean): SourceHealth {
  if (tally.companiesQueried === 0) {
    return {
      ...tally,
      verdict: "inconclusive",
      note: "Källan kördes inte i den här körningen.",
    };
  }

  // Strypning bedöms före haveri. En källa som svarar 429 svarar — problemet
  // ligger hos oss, i takten, inte hos den.
  if (tally.throttled > 0 && tally.companiesWithHits === 0) {
    return {
      ...tally,
      verdict: "throttled",
      note:
        `Svarade 429 för ${tally.throttled} av ${tally.companiesQueried} bolag. ` +
        `Sänk DISCOVERY_CONCURRENCY eller kontrollera kvoten.`,
    };
  }

  if (tally.failures >= tally.companiesQueried / 2) {
    return {
      ...tally,
      verdict: "failing",
      note: `Kastade fel för ${tally.failures} av ${tally.companiesQueried} bolag.`,
    };
  }

  if (tally.companiesWithHits > 0) {
    return {
      ...tally,
      verdict: "healthy",
      note: `${tally.totalHits} träffar över ${tally.companiesWithHits} bolag.`,
    };
  }

  if (SOURCES_EXEMPT_FROM_SILENCE.includes(tally.source)) {
    return {
      ...tally,
      verdict: "inconclusive",
      note: "Noll träffar är normalläge för den här källan.",
    };
  }

  // Noll träffar utan fel. Bara oroande om någon *annan* källa hittade något —
  // annars är det troligare att portföljen faktiskt är nyhetstyst i dag.
  if (!portfolioHadHits) {
    return {
      ...tally,
      verdict: "inconclusive",
      note: "Noll träffar, men ingen källa hittade något — troligen en lugn dag.",
    };
  }

  return {
    ...tally,
    verdict: "silent",
    note:
      `Noll träffar för samtliga ${tally.companiesQueried} bolag, utan att ` +
      `kasta fel, medan andra källor levererade. Källan svarar men säger inget.`,
  };
}

export interface SourceHealthReport {
  sources: SourceHealth[];
  /** Källor som svarar men inget säger — det som ska väcka någon. */
  silent: SourceLabel[];
  /** Källor som är nere på riktigt. */
  failing: SourceLabel[];
  /** Källor som stryper oss. Rapporteras men väcker ingen. */
  throttled: SourceLabel[];
  healthy: boolean;
}

export function assessSourceHealth(
  tallies: readonly SourceTally[],
): SourceHealthReport {
  const portfolioHadHits = tallies.some(
    (tally) => tally.companiesWithHits > 0,
  );

  const sources = tallies.map((tally) => judge(tally, portfolioHadHits));

  const silent = sources
    .filter((source) => source.verdict === "silent")
    .map((source) => source.source);
  const failing = sources
    .filter((source) => source.verdict === "failing")
    .map((source) => source.source);
  const throttled = sources
    .filter((source) => source.verdict === "throttled")
    .map((source) => source.source);

  return {
    sources,
    silent,
    failing,
    throttled,
    // Strypning räknas inte som ohälsa. Den är åtgärdbar av oss och betyder
    // inte att bevakningen ligger nere.
    healthy: silent.length === 0 && failing.length === 0,
  };
}

/** Slår ihop utfallet för ett enskilt bolag in i den löpande summeringen. */
export function tallyCompanyOutcome(
  totals: Map<SourceLabel, SourceTally>,
  source: SourceLabel,
  outcome: { hits: number; ok: boolean; throttled?: boolean },
): void {
  const current = totals.get(source) ?? {
    source,
    companiesQueried: 0,
    companiesWithHits: 0,
    totalHits: 0,
    failures: 0,
    throttled: 0,
  };

  const wasThrottled = outcome.throttled === true;

  totals.set(source, {
    source,
    companiesQueried: current.companiesQueried + 1,
    companiesWithHits: current.companiesWithHits + (outcome.hits > 0 ? 1 : 0),
    totalHits: current.totalHits + outcome.hits,
    // En strypning är inte ett haveri och ska inte räknas som ett.
    failures: current.failures + (outcome.ok || wasThrottled ? 0 : 1),
    throttled: current.throttled + (wasThrottled ? 1 : 0),
  });
}
