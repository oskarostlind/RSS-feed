import { NewsItemStatus } from "@/generated/prisma/enums";

interface NewsStatusBadgeProps {
  status: (typeof NewsItemStatus)[keyof typeof NewsItemStatus];
}

const STATUS_CONFIG: Record<
  (typeof NewsItemStatus)[keyof typeof NewsItemStatus],
  { label: string; className: string }
> = {
  [NewsItemStatus.PENDING]: {
    label: "Oläst",
    className:
      "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  [NewsItemStatus.CONFIRMED]: {
    label: "Godkänd",
    className:
      "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  },
  [NewsItemStatus.REJECTED]: {
    label: "Avvisad",
    className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
};

export function NewsStatusBadge({ status }: NewsStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
