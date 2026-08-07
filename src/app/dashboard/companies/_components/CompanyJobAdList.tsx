import type { CompanyJobAdRow } from "@/lib/companies/queries";
import { formatNewsDate } from "@/lib/utils/formatDate";

interface CompanyJobAdListProps {
  jobAds: CompanyJobAdRow[];
}

/**
 * En annons vars sista ansökningsdag passerat är inte längre en signal om vad
 * bolaget håller på med just nu — men den är fortfarande historik värd att se,
 * så den tonas ned i stället för att döljas.
 */
function isExpired(jobAd: CompanyJobAdRow, now: Date): boolean {
  return jobAd.deadline !== null && jobAd.deadline.getTime() < now.getTime();
}

function buildSubtitle(jobAd: CompanyJobAdRow): string {
  return [jobAd.occupation, jobAd.municipality].filter(Boolean).join(" · ");
}

export function CompanyJobAdList({ jobAds }: CompanyJobAdListProps) {
  if (jobAds.length === 0) {
    return null;
  }

  const now = new Date();
  const active = jobAds.filter((jobAd) => !isExpired(jobAd, now));

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Jobbannonser
        </h2>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {active.length} aktiva av {jobAds.length}
        </span>
      </div>

      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Från Platsbanken. Flera annonser på samma ort är oftast en expansion —
        och syns där innan den syns i pressen.
      </p>

      <ul className="grid grid-cols-1 gap-3">
        {jobAds.map((jobAd) => {
          const expired = isExpired(jobAd, now);
          const subtitle = buildSubtitle(jobAd);

          return (
            <li
              key={jobAd.id}
              className={`rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950 ${
                expired ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-baseline justify-between gap-4">
                <a
                  href={jobAd.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:text-zinc-100 dark:decoration-zinc-600 dark:hover:decoration-zinc-100"
                >
                  {jobAd.headline}
                </a>
                {expired ? (
                  <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                    Utgången
                  </span>
                ) : null}
              </div>

              {subtitle ? (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {subtitle}
                </p>
              ) : null}

              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                {jobAd.employerName} · {formatNewsDate(jobAd.publishedAt)}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
