import Link from "next/link";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Startsidan.
 *
 * Var tidigare en utvecklarsida: ordet "MVP" i brödtexten, och två knappar som
 * båda ledde till inloggningsskyddade sidor utan att säga det. En besökare som
 * inte var inloggad möttes av en omdirigering utan förklaring.
 *
 * Knapparna anpassas nu efter om någon är inloggad. Texten beskriver vad
 * tjänsten gör för den som ska använda den, inte vad den är för den som byggt
 * den.
 */

const PUNKTER = [
  {
    rubrik: "Lokalpressen, inte bara riksmedia",
    text: "De stora nyhetstjänsterna indexerar Dagens industri och SVT. Det är Ljusdals-Posten och Metal Supply som först skriver om att din kund köpt upp en konkurrent.",
  },
  {
    rubrik: "Ett mejl på morgonen",
    text: "Inga notiser under dagen, ingen instrumentpanel att komma ihåg att öppna. Bara det som hänt sedan igår, i inkorgen.",
  },
  {
    rubrik: "Jobbannonser räknas som nyheter",
    text: "Ett bolag som rekryterar tio personer till en ny ort har expanderat, även om ingen tidning skrivit om det än.",
  },
];

export default async function Home() {
  const session = await auth();
  const inloggad = Boolean(session?.user);

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Kundnytt
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Få veta när det händer något hos dina kunder
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          Lägg in bolagen du jobbar mot. Varje morgon kommer ett mejl om de
          dykt upp i svensk nyhetsmedia — förvärv, konkurser, expansioner,
          ägarbyten.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {inloggad ? (
            <Link
              href="/dashboard"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Öppna inkorgen
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Logga in eller skapa konto
            </Link>
          )}
          <Link
            href="/integritetspolicy"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-zinc-300 px-6 text-sm font-medium text-zinc-800 transition-colors hover:bg-white dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Så hanterar vi dina uppgifter
          </Link>
        </div>

        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          Inget lösenord behövs — du loggar in med en länk till din mejladress.
        </p>

        <dl className="mt-16 space-y-8 border-t border-zinc-200 pt-10 dark:border-zinc-800">
          {PUNKTER.map((punkt) => (
            <div key={punkt.rubrik}>
              <dt className="text-base font-medium text-zinc-900 dark:text-zinc-50">
                {punkt.rubrik}
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {punkt.text}
              </dd>
            </div>
          ))}
        </dl>
      </main>

      <footer className="border-t border-zinc-200 py-6 dark:border-zinc-800">
        <div className="mx-auto flex max-w-2xl flex-wrap gap-x-5 gap-y-2 px-6 text-xs text-zinc-500 dark:text-zinc-400">
          <span>Kundnytt</span>
          <Link href="/integritetspolicy" className="underline-offset-4 hover:underline">
            Integritetspolicy
          </Link>
          <a
            href="mailto:oskarandreassen01@gmail.com"
            className="underline-offset-4 hover:underline"
          >
            Kontakt
          </a>
        </div>
      </footer>
    </div>
  );
}
