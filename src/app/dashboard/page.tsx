import Link from "next/link";
import { NewsInboxCard } from "@/app/dashboard/_components/NewsInboxCard";
import { ReadAllButton } from "@/app/dashboard/_components/ReadAllButton";
import { auth } from "@/lib/auth";
import { getPortfolioCapacity } from "@/lib/companies/portfolioLimit";
import { getPendingNewsItems } from "@/lib/news/queries";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  // Antalet bevakningar avgör vilket tomt tillstånd som är sant. En tom
  // inkorg betyder olika saker beroende på om användaren har bolag eller inte,
  // och att säga fel sak till en ny användare är en återvändsgränd.
  const [pendingItems, capacity] = await Promise.all([
    getPendingNewsItems(userId),
    getPortfolioCapacity(userId),
  ]);

  const harBevakningar = capacity.used > 0;

  return (
    <>
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {/* Wrap och gap: på en telefon får rubriken och räknaren inte plats
            bredvid varandra, och utan wrap klämdes räknaren ihop till två
            rader mitt i ordet. */}
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Inkorg
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Granska nyheter som väntar på ditt beslut.
            </p>
          </div>
          {/* Räknaren och "Läs alla" hör ihop: knappen betyder inget utan
              antalet den kommer att röra, och antalet är det enda som gör
              bekräftelsefrågan begriplig. */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {pendingItems.length} att granska
            </span>
            <ReadAllButton count={pendingItems.length} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {pendingItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-8 py-16 text-center dark:border-zinc-700 dark:bg-zinc-950">
            {harBevakningar ? (
              <>
                <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
                  Inkorgen är tom
                </p>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Nya nyheter hämtas automatiskt varje morgon. Du kan också söka
                  direkt från ett bolags sida.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
                  Börja med att lägga till ett bolag
                </p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
                  Du bevakar inga bolag ännu, så det finns inget att hämta. Lägg
                  in kunderna du vill ha koll på — sedan kommer ett mejl varje
                  morgon när något händer.
                </p>
                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                  <Link
                    href="/dashboard/companies"
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    Lägg till ett bolag
                  </Link>
                  <Link
                    href="/dashboard/companies/import"
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 px-5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Importera från Excel
                  </Link>
                </div>
              </>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-5">
            {pendingItems.map((item) => (
              <li key={item.id}>
                <NewsInboxCard item={item} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
