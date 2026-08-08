import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import {
  deleteAccountAction,
  exportAccountData,
  requestEmailChangeAction,
  setMorningEmailAction,
} from "@/lib/account/actions";
import { auth, getRequiredUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DataExportButton } from "./_components/DataExportButton";

export const dynamic = "force-dynamic";

interface KontoPageProps {
  searchParams: Promise<{
    fel?: string;
    mejl?: string;
    adressbyte?: string;
    till?: string;
  }>;
}

const FELMEDDELANDEN: Record<string, string> = {
  bekraftelse: 'Du måste skriva RADERA i rutan för att bekräfta.',
  misslyckades: "Kontot kunde inte raderas. Försök igen.",
  mejlinstallning: "Inställningen kunde inte sparas. Försök igen.",
};

/**
 * Fel som hör till adressbytet, skilda från de ovan så att de kan visas vid
 * sitt eget formulär. Ett meddelande om en felstavad adress i raderingsrutans
 * röda ram läser sig som något långt värre än det är.
 */
const ADRESSBYTESFEL: Record<string, string> = {
  format: "Det där ser inte ut som en mejladress vi kan skicka till.",
  samma: "Det är adressen du redan har.",
  tagen: "Adressen används redan av ett annat konto.",
  hemlighet:
    "Tjänsten saknar den nyckel som behövs för att signera bekräftelselänken. Hör av dig så rättar vi det.",
  adress:
    "Tjänsten vet inte vilken publik adress den har, så länken kan inte byggas. Hör av dig så rättar vi det.",
  utskick:
    "Bekräftelsemejlet kunde inte skickas. Kontrollera adressen och försök igen.",
  fel: "Något gick fel. Försök igen.",
};

export default async function KontoPage({ searchParams }: KontoPageProps) {
  const { fel, mejl, adressbyte, till } = await searchParams;
  const adressbytesfel = fel?.startsWith("adressbyte-")
    ? fel.slice("adressbyte-".length)
    : null;
  const session = await auth();
  const data = await exportAccountData();

  const userId = await getRequiredUserId();
  const konto = await prisma.user.findUnique({
    where: { id: userId },
    select: { morningEmailOptOutAt: true },
  });
  const morgonmejlPa = konto?.morningEmailOptOutAt == null;

  const antalBolag = data.bolag.length;
  const antalNyheter = data.bolag.reduce(
    (sum, bolag) => sum + bolag.nyheter.length,
    0,
  );
  const antalAnnonser = data.bolag.reduce(
    (sum, bolag) => sum + bolag.jobbannonser.length,
    0,
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Konto och data
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Inloggad som {session?.user?.email ?? "okänd adress"}.
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          Det här lagrar vi om dig
        </h2>
        {/* En kolumn på telefon. Tre 100-pixelskort bredvid varandra på en
            375-skärm bryter siffrorna mitt itu. */}
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          {[
            ["Bevakade bolag", antalBolag],
            ["Sparade nyheter", antalNyheter],
            ["Jobbannonser", antalAnnonser],
          ].map(([etikett, antal]) => (
            <div
              key={etikett}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                {etikett}
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {antal}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Utöver detta lagras din mejladress och dina inloggningssessioner.
          Bevakningslistan kan vara affärskänslig — den visar vilka bolag du
          följer — så vi delar den inte med någon.
        </p>
        <DataExportButton />
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          Mejladress
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Adressen är också din inloggning — det är hit inloggningslänken går.
          Därför byts den i två steg: vi skickar en bekräftelse till den nya
          adressen, och kontot flyttas först när du klickat i det mejlet. Fram
          till dess fungerar din nuvarande adress som vanligt.
        </p>

        {adressbyte === "skickat" && (
          <p
            role="status"
            className="mt-4 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
          >
            Bekräftelse skickad till {till ?? "den nya adressen"}. Länken är
            giltig i en timme. Kolla skräpposten om den inte dykt upp.
          </p>
        )}

        {adressbytesfel && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          >
            {ADRESSBYTESFEL[adressbytesfel] ?? ADRESSBYTESFEL.fel}
          </p>
        )}

        <form
          action={requestEmailChangeAction}
          className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        >
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="epost"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Ny mejladress
            </label>
            <input
              id="epost"
              name="epost"
              type="email"
              required
              autoComplete="email"
              placeholder="fornamn@foretaget.se"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 sm:w-72"
            />
          </div>
          <SubmitButton
            pendingLabel="Skickar..."
            className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900 sm:w-auto"
          >
            Skicka bekräftelse
          </SubmitButton>
        </form>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          Morgonmejlet
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {morgonmejlPa
            ? "Du får ett mejl på morgonen när något nytt hittats om dina bolag. Uteblir mejlet betyder det att natten var tyst."
            : "Du får inga morgonmejl. Bevakningarna körs som vanligt och nyheterna syns i inkorgen här."}
        </p>

        {/* Kvitto och fel hör hemma vid den knapp de gäller. Den delade
            felrutan längre ner tillhör raderingen, och ett meddelande om
            mejlinställningar i en röd ruta läser sig som något värre än det är. */}
        {mejl && (
          <p
            role="status"
            className="mt-4 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
          >
            {mejl === "pa"
              ? "Morgonmejlet är påslaget igen."
              : "Morgonmejlet är avstängt."}
          </p>
        )}

        {fel === "mejlinstallning" && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          >
            {FELMEDDELANDEN.mejlinstallning}
          </p>
        )}

        <form action={setMorningEmailAction} className="mt-4">
          <input type="hidden" name="aktivera" value={morgonmejlPa ? "0" : "1"} />
          <SubmitButton
            pendingLabel="Sparar..."
            className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900 sm:w-auto"
          >
            {morgonmejlPa ? "Stäng av morgonmejlet" : "Slå på morgonmejlet"}
          </SubmitButton>
        </form>
      </section>

      <section className="mt-12 rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/20">
        <h2 className="text-lg font-medium text-red-900 dark:text-red-200">
          Radera kontot
        </h2>
        <p className="mt-2 text-sm text-red-800 dark:text-red-300">
          Allt raderas direkt och permanent: {antalBolag} bevakningar,{" "}
          {antalNyheter} sparade nyheter, {antalAnnonser} jobbannonser och din
          mejladress. Det går inte att ångra, och vi har ingen säkerhetskopia
          att återställa från.
        </p>

        {fel && fel !== "mejlinstallning" && FELMEDDELANDEN[fel] && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          >
            {FELMEDDELANDEN[fel]}
          </p>
        )}

        <form action={deleteAccountAction} className="mt-5 flex flex-col gap-3">
          <label
            htmlFor="bekraftelse"
            className="text-sm font-medium text-red-900 dark:text-red-200"
          >
            Skriv RADERA för att bekräfta
          </label>
          <input
            id="bekraftelse"
            name="bekraftelse"
            type="text"
            autoComplete="off"
            required
            className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-red-800 dark:bg-zinc-950 dark:text-zinc-50 sm:w-48"
          />
          {/* Raderingen kaskaderar genom hela schemat och kan ta ett par
              sekunder. Utan besked ser det ut som att bekräftelsen inte tog,
              och ett andra klick på just den här knappen är inget att bjuda
              på. */}
          <SubmitButton
            pendingLabel="Raderar..."
            className="w-full rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800 sm:w-fit"
          >
            Radera kontot permanent
          </SubmitButton>
        </form>
      </section>

      <p className="mt-8 text-sm">
        <Link
          href="/dashboard"
          className="text-zinc-500 underline underline-offset-4 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Tillbaka till inkorgen
        </Link>
        <span className="mx-2 text-zinc-400">·</span>
        <Link
          href="/integritetspolicy"
          className="text-zinc-500 underline underline-offset-4 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Integritetspolicy
        </Link>
      </p>
    </main>
  );
}
