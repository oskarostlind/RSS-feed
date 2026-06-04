import Link from "next/link";
import { NewsStatusBadge } from "@/app/dashboard/companies/_components/NewsStatusBadge";
import type { CompanyNewsHistoryRow } from "@/lib/companies/queries";
import { formatNewsDate } from "@/lib/utils/formatDate";

interface CompanyHistoryItemProps {
  item: CompanyNewsHistoryRow;
}

export function CompanyHistoryItem({ item }: CompanyHistoryItemProps) {
  const displayDate = formatNewsDate(item.publishedAt ?? item.createdAt);
  const snippet =
    item.snippet?.trim() || "Ingen beskrivning tillgänglig för denna artikel.";

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <NewsStatusBadge status={item.status} />
        <time
          dateTime={(item.publishedAt ?? item.createdAt).toISOString()}
          className="text-sm text-zinc-500 dark:text-zinc-400"
        >
          {displayDate}
        </time>
      </div>

      <h2 className="text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
        <Link
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {item.title}
        </Link>
      </h2>

      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {snippet}
      </p>
    </li>
  );
}
