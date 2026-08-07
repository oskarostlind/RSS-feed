import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyHistoryItem } from "@/app/dashboard/companies/_components/CompanyHistoryItem";
import { CompanyJobAdList } from "@/app/dashboard/companies/_components/CompanyJobAdList";
import { CompanyNewsSearchButton } from "@/app/dashboard/companies/_components/CompanyNewsSearchButton";
import { NewsItemStatus } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { getCompanyWithNewsItems } from "@/lib/companies/queries";

interface CompanyDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CompanyDetailPage({
  params,
}: CompanyDetailPageProps) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  const { id } = await params;
  const company = await getCompanyWithNewsItems(id, userId);

  if (!company) {
    notFound();
  }

  const { newsItems, jobAds } = company;
  const unreadCount = newsItems.filter(
    (item) => item.status === NewsItemStatus.PENDING,
  ).length;
  const confirmedCount = newsItems.filter(
    (item) => item.status === NewsItemStatus.CONFIRMED,
  ).length;

  return (
    <>
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <Link
            href="/dashboard/companies"
            className="inline-flex items-center text-sm text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← Tillbaka till portföljen
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {company.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {newsItems.length}{" "}
            {newsItems.length === 1 ? "artikel" : "artiklar"} · {unreadCount}{" "}
            olästa · {confirmedCount} godkända
            {jobAds.length > 0
              ? ` · ${jobAds.length} ${
                  jobAds.length === 1 ? "jobbannons" : "jobbannonser"
                }`
              : ""}
          </p>
          <div className="mt-4">
            <CompanyNewsSearchButton
              companyId={company.id}
              companyName={company.name}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <CompanyJobAdList jobAds={jobAds} />

        {newsItems.length === 0 && jobAds.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-8 py-16 text-center dark:border-zinc-700 dark:bg-zinc-950">
            <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Ingen historik ännu
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Kör en nyhetssökning för att hämta artiklar för det här företaget.
            </p>
          </div>
        ) : (
          <section>
            {jobAds.length > 0 ? (
              <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Artiklar
              </h2>
            ) : null}

            <ul className="grid grid-cols-1 gap-4">
              {newsItems.map((item) => (
                <CompanyHistoryItem key={item.id} item={item} />
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
