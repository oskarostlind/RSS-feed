import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requestMagicLinkAction } from "@/lib/auth/actions";
import { resolveSender } from "@/lib/email/sender";

/**
 * Egen inloggningssida.
 *
 * `pages.signIn` pekade tidigare på `/api/auth/signin`, alltså Auth.js egen
 * hanterare. Den routen skickar i sin tur vidare till `pages.signIn` när den är
 * satt, så varje besök på en skyddad sida hamnade i en oändlig
 * omdirigeringskarusell — knapparna på startsidan ledde ingenstans.
 */

interface LoginPageProps {
  searchParams: Promise<{ skickat?: string; fel?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  const avsandare = resolveSender();

  if (session?.user) {
    redirect("/dashboard");
  }

  const { skickat, fel } = await searchParams;

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Logga in
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Vi mejlar en inloggningslänk. Inget lösenord behövs.
        </p>

        {skickat ? (
          <p className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            Länken är skickad och är giltig i 24 timmar.
            {/*
              Skräppostvarningen visas bara så länge avsändaren sitter på den
              delade sandlådedomänen. Den försvinner av sig själv när
              EMAIL_FROM pekar på en verifierad domän — en varning som står
              kvar när problemet är löst lär användaren att strunta i den.
            */}
            {avsandare.isVerifiedDomain ? null : (
              <>
                {" "}
                Hittar du den inte i inkorgen:{" "}
                <strong>kolla skräpposten</strong> och sök på
                &quot;Kundnytt&quot;. Avsändaren är en delad
                Resend-adress tills vi har en egen verifierad domän, och den
                sorteras ofta undan första gången.
              </>
            )}
          </p>
        ) : null}

        {fel ? (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            Länken kunde inte skickas. Kontrollera adressen och försök igen.
          </p>
        ) : null}

        <form action={requestMagicLinkAction} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
            >
              E-postadress
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="namn@foretag.se"
              className="mt-2 block h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-300"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Skicka inloggningslänk
          </button>
        </form>
      
        <p className="mt-8 text-xs text-zinc-500 dark:text-zinc-400">
          Genom att logga in godtar du att vi behandlar din mejladress och dina
          bevakningar enligt vår{" "}
          <Link
            href="/integritetspolicy"
            className="underline underline-offset-4"
          >
            integritetspolicy
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
