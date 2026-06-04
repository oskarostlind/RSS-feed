"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { searchNewsForCompany } from "@/lib/companies/actions";

interface CompanyNewsSearchButtonProps {
  companyId: string;
  companyName: string;
}

function formatResultMessage(
  companyName: string,
  created: number,
  found: number,
): string {
  if (created === 0 && found === 0) {
    return `Sökning klar för ${companyName}. Inga träffar — kontrollera GNEWS_API_KEY och SCRAPINGBEE_API_KEY.`;
  }

  if (created === 0) {
    return `Sökning klar för ${companyName}. Inga nya artiklar (${found} träffar, inga nya att spara).`;
  }

  if (created === 1) {
    return `Sökning klar för ${companyName}. Hittade 1 ny artikel.`;
  }

  return `Sökning klar för ${companyName}. Hittade ${created} nya artiklar.`;
}

export function CompanyNewsSearchButton({
  companyId,
  companyName,
}: CompanyNewsSearchButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const handleSearch = (): void => {
    setMessage(null);
    setIsError(false);

    startTransition(async () => {
      const result = await searchNewsForCompany(companyId);

      if (result.success) {
        setIsError(false);
        setMessage(
          formatResultMessage(companyName, result.created, result.found),
        );
        router.refresh();
        return;
      }

      setIsError(true);
      setMessage(result.error ?? "Sökningen misslyckades.");
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleSearch}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPending ? (
          <>
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
              aria-hidden="true"
            />
            Söker...
          </>
        ) : (
          "Leta nyheter"
        )}
      </button>

      {message ? (
        <p
          role="status"
          aria-live="polite"
          className={`max-w-xs text-right text-xs ${
            isError
              ? "text-red-600 dark:text-red-400"
              : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
