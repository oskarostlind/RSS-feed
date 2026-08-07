import Link from "next/link";
import { addCompany } from "@/lib/companies/actions";

interface AddCompanyFormProps {
  errorMessage: string | null;
}

export function AddCompanyForm({ errorMessage }: AddCompanyFormProps) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Lägg till företag
        </h2>
        <Link
          href="/dashboard/companies/import"
          className="text-sm font-medium text-zinc-600 underline transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Importera från fil
        </Link>
      </div>

      {errorMessage ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {errorMessage}
        </p>
      ) : null}

      <form action={addCompany} className="flex flex-col gap-4 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Företagsnamn
          </span>
          <input
            type="text"
            name="name"
            required
            placeholder='t.ex. "Volvo"'
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none ring-zinc-400 transition-shadow placeholder:text-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500"
          />
        </label>
        <button
          type="submit"
          className="h-[42px] self-end rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 sm:mt-6"
        >
          Lägg till
        </button>
      </form>
    </section>
  );
}
