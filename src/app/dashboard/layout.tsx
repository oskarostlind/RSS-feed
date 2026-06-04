import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { signOutAction } from "@/lib/auth/actions";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const userLabel = session.user.email ?? session.user.name ?? "Inloggad";

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-black">
      <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Inkorg
          </Link>
          <Link
            href="/dashboard/companies"
            className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Bevakade företag
          </Link>
          <div className="ml-auto flex items-center gap-4">
            <span className="max-w-[180px] truncate text-xs text-zinc-500 dark:text-zinc-400">
              {userLabel}
            </span>
            <Link
              href="/"
              className="text-sm text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Startsida
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-sm text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Logga ut
              </button>
            </form>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
