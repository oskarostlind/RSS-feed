import { AddCompanyForm } from "@/app/dashboard/companies/_components/AddCompanyForm";
import { CompanyListItem } from "@/app/dashboard/companies/_components/CompanyListItem";
import { auth } from "@/lib/auth";
import { getAllCompanies } from "@/lib/companies/queries";

interface CompaniesPageProps {
  searchParams: Promise<{ error?: string }>;
}

function resolveErrorMessage(error: string | undefined): string | null {
  switch (error) {
    case "empty":
      return "Ange ett företagsnamn.";
    case "duplicate":
      return "Det företaget finns redan i portföljen.";
    case "limit":
      return "Portföljen är full. Ta bort några bevakningar först.";
    case "failed":
      return "Kunde inte spara företaget. Försök igen.";
    default:
      return null;
  }
}

export default async function CompaniesPage({
  searchParams,
}: CompaniesPageProps) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  const params = await searchParams;
  const companies = await getAllCompanies(userId);
  const errorMessage = resolveErrorMessage(params.error);

  return (
    <>
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Bevakade företag
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Hantera vilka företag systemet ska söka nyheter för. Klicka på ett
            företagsnamn för att läsa artikelhistorik.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-6 py-8">
        <AddCompanyForm errorMessage={errorMessage} />

        <section>
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Portfölj ({companies.length})
          </h2>

          {companies.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-8 py-12 text-center dark:border-zinc-700 dark:bg-zinc-950">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Inga företag bevakas ännu. Lägg till det första ovan.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {companies.map((company) => (
                <CompanyListItem key={company.id} company={company} />
              ))}
            </ul>
          )}

          <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
            När du tar bort ett företag raderas även tillhörande nyheter och
            källor automatiskt.
          </p>
        </section>
      </main>
    </>
  );
}
