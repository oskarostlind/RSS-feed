import Link from "next/link";
import { ImportWizard } from "@/app/dashboard/companies/import/_components/ImportWizard";
import { auth } from "@/lib/auth";

export default async function ImportCompaniesPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  return (
    <>
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <Link
            href="/dashboard/companies"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Bevakningar
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Importera bolag
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Ladda upp kundlistan från Excel eller CRM. Du får se exakt vad som
            kommer att läggas till innan något sparas.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <ImportWizard />
      </main>
    </>
  );
}
