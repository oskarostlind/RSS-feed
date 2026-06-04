import Link from "next/link";
import { approveNewsItem, rejectNewsItem } from "@/lib/news/actions";
import type { PendingNewsItemRow } from "@/lib/news/queries";
import { formatNewsDate } from "@/lib/utils/formatDate";

interface NewsInboxCardProps {
  item: PendingNewsItemRow;
}

export function NewsInboxCard({ item }: NewsInboxCardProps) {
  const displayDate = formatNewsDate(item.publishedAt ?? item.createdAt);
  const snippet =
    item.snippet?.trim() || "Ingen beskrivning tillgänglig för denna artikel.";

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
          {item.company.name}
        </span>
        <time dateTime={(item.publishedAt ?? item.createdAt).toISOString()}>
          {displayDate}
        </time>
      </div>

      <h2 className="mb-2 text-lg font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
        <Link
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {item.title}
        </Link>
      </h2>

      <p className="mb-6 line-clamp-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {snippet}
      </p>

      <div className="flex flex-wrap gap-3">
        <form action={approveNewsItem.bind(null, item.id)}>
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            Godkänn
          </button>
        </form>
        <form action={rejectNewsItem.bind(null, item.id)}>
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Ignorera
          </button>
        </form>
      </div>
    </article>
  );
}
