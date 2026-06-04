import Link from "next/link";
import { CompanyNewsSearchButton } from "@/app/dashboard/companies/_components/CompanyNewsSearchButton";
import { deleteCompany } from "@/lib/companies/actions";
import type { CompanyRow } from "@/lib/companies/queries";
import { formatNewsDate } from "@/lib/utils/formatDate";

interface CompanyListItemProps {
  company: CompanyRow;
}

function formatArticleCounts(unread: number, total: number): string {
  const unreadLabel = unread === 1 ? "1 oläst" : `${unread} olästa`;
  const totalLabel = total === 1 ? "1 totalt" : `${total} totalt`;
  return `${unreadLabel} / ${totalLabel}`;
}

export function CompanyListItem({ company }: CompanyListItemProps) {
  const articleCounts = formatArticleCounts(
    company.unreadCount,
    company.totalCount,
  );
  const detailHref = `/dashboard/companies/${company.id}`;

  return (
    <li className="relative rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <Link
        href={detailHref}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:focus-visible:outline-zinc-100"
        aria-label={`Visa historik för ${company.name}`}
      />

      <div className="relative z-10 flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">
            {company.name}
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Tillagt {formatNewsDate(company.createdAt)} · {articleCounts}
          </p>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-start justify-end gap-3">
          <CompanyNewsSearchButton
            companyId={company.id}
            companyName={company.name}
          />
          <form action={deleteCompany.bind(null, company.id)}>
            <button
              type="submit"
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
            >
              Ta bort
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}
