import { splitCompanyName } from "@/lib/search/companyQuery";
import type { JobAdHit } from "@/lib/jobs/types";

/**
 * Jobbannonser från Arbetsförmedlingens JobTech (Platsbanken).
 *
 * Skälet att bygga den här källan alls: **rekrytering avslöjar expansion före
 * pressen.** Ett bolag som lägger ut fem produktionsannonser gör det veckor
 * innan lokaltidningen skriver om nyanställningarna, och ofta månader innan ett
 * pressmeddelande. För en account manager är det bättre timing än en nyhet.
 *
 * Till skillnad från Bolagsverkets API:er kräver JobTech varken registrering
 * eller nyckel — det är öppna data med dokumenterat format, vilket också gör
 * det till en betydligt stabilare källa än de odokumenterade RSS-flödena i
 * `RssFeedService`.
 */

const JOBTECH_SEARCH_URL = "https://jobsearch.api.jobtechdev.se/search";

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Hämtar fler än vi behöver, eftersom fritextsökningen träffar hela
 * annonstexten och `filterJobAdsByEmployer` sedan slänger merparten.
 */
const RESULT_LIMIT = 25;

const USER_AGENT =
  "OmvarldsbevakareBot/1.0 (+https://github.com/oskarostlind/RSS-feed)";

export class JobTechError extends Error {
  readonly httpStatus?: number;

  constructor(message: string, options?: { httpStatus?: number; cause?: unknown }) {
    super(message);
    this.name = "JobTechError";
    this.httpStatus = options?.httpStatus;
    this.cause = options?.cause;
  }
}

interface RawJobTechHit {
  id?: string;
  headline?: string;
  webpage_url?: string;
  publication_date?: string;
  application_deadline?: string;
  employer?: {
    name?: string | null;
    workplace?: string | null;
    organization_number?: string | null;
  } | null;
  occupation?: { label?: string | null } | null;
  workplace_address?: {
    municipality?: string | null;
    region?: string | null;
  } | null;
}

interface RawJobTechResponse {
  total?: { value?: number };
  hits?: RawJobTechHit[];
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toJobAdHit(raw: RawJobTechHit): JobAdHit | null {
  const externalId = nonEmpty(raw.id);
  const headline = nonEmpty(raw.headline);
  const employerName = nonEmpty(raw.employer?.name);

  // Utan id går dedupliceringen inte att göra, och utan arbetsgivare går
  // matchningen inte att göra. En sådan post är värdelös oavsett vad den
  // annars innehåller.
  if (!externalId || !headline || !employerName) {
    return null;
  }

  return {
    externalId,
    headline,
    employerName,
    workplaceName: nonEmpty(raw.employer?.workplace),
    organizationNumber: nonEmpty(raw.employer?.organization_number),
    occupation: nonEmpty(raw.occupation?.label),
    municipality: nonEmpty(raw.workplace_address?.municipality),
    region: nonEmpty(raw.workplace_address?.region),
    url:
      nonEmpty(raw.webpage_url) ??
      `https://arbetsformedlingen.se/platsbanken/annonser/${externalId}`,
    publishedAt: parseDate(raw.publication_date),
    deadline: parseDate(raw.application_deadline),
  };
}

/**
 * Sök på varumärkesledet, inte på hela det registrerade namnet.
 *
 * JobTechs fritextindex innehåller annonstexten, inte bolagsregistrets
 * stavning. En annons från Peges skriver "Peges" eller "Peges Industri" — inte
 * "Peges i Ljusdal AB". Både bolagsformen och ortsledet gör den exakta frasen
 * så snäv att den ger noll träffar.
 *
 * Att bredda frågan kostar inget i precision, eftersom
 * `filterJobAdsByEmployer` ändå kräver träff mot arbetsgivarfältet efteråt.
 */
export function buildJobTechQuery(companyName: string): string | null {
  const { brand } = splitCompanyName(companyName);

  return brand ? `"${brand}"` : null;
}

export class JobTechService {
  async searchForCompany(companyName: string): Promise<JobAdHit[]> {
    const query = buildJobTechQuery(companyName);

    if (!query) {
      return [];
    }

    const params = new URLSearchParams({
      q: query,
      limit: String(RESULT_LIMIT),
    });

    const url = `${JOBTECH_SEARCH_URL}?${params.toString()}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new JobTechError(
          `JobTech search failed with HTTP ${response.status}`,
          { httpStatus: response.status },
        );
      }

      const data = (await response.json()) as RawJobTechResponse;

      if (!data.hits?.length) {
        return [];
      }

      return data.hits
        .map(toJobAdHit)
        .filter((hit): hit is JobAdHit => hit !== null);
    } catch (error) {
      if (error instanceof JobTechError) {
        throw error;
      }

      throw new JobTechError("JobTech search request failed", { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }
}
