import { deleteCompany } from "@/lib/companies/actions";
import type { CompanyRow } from "@/lib/companies/queries";
import { formatNewsDate } from "@/lib/utils/formatDate";

interface CompanyListItemProps {
  company: CompanyRow;
}

export function CompanyListItem({ company }: CompanyListItemProps) {
  const articleLabel =
    company._count.newsItems === 1 ? "1 artikel" : `${company._count.newsItems} artiklar`;

  return (
    <li className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <p className="font-medium text-zinc-900 dark:text-zinc-50">
          {company.name}
        </p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Tillagt {formatNewsDate(company.createdAt)} · {articleLabel}
        </p>
      </div>

      <form action={deleteCompany.bind(null, company.id)}>
        <button
          type="submit"
          className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
        >
          Ta bort
        </button>
      </form>
    </li>
  );
}
