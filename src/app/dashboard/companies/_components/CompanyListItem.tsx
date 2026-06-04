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
    <li className="rounded-xl border border-zinc-200 bg-white shadow-sm transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700">
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <Link
            href={detailHref}
            className="font-medium text-zinc-900 transition-colors hover:text-emerald-700 hover:underline dark:text-zinc-50 dark:hover:text-emerald-400"
          >
            {company.name}
          </Link>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Tillagt {formatNewsDate(company.createdAt)} · {articleCounts}
          </p>
        </div>

        <div className="flex flex-wrap items-start justify-end gap-3">
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
