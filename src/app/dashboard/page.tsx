import { NewsInboxCard } from "@/app/dashboard/_components/NewsInboxCard";
import { auth } from "@/lib/auth";
import { getPendingNewsItems } from "@/lib/news/queries";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  const pendingItems = await getPendingNewsItems(userId);

  return (
    <>
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Inkorg
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Granska nyheter som väntar på ditt beslut.
            </p>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {pendingItems.length} att granska
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {pendingItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-8 py-16 text-center dark:border-zinc-700 dark:bg-zinc-950">
            <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Inkorgen är tom
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Kör en sökning via API:et för att hämta nya nyheter, eller vänta
              på nästa schemalagda körning.
            </p>
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
