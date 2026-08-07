import Link from "next/link";

export const metadata = {
  title: "Integritetspolicy — Kundnytt",
};

/**
 * Personuppgiftspolicy. Sista GDPR-kravet före öppen registrering.
 *
 * Skriven för att beskriva vad tjänsten **faktiskt** gör, inte för att täcka
 * varje tänkbar framtida behandling. En policy som lovar mindre än koden gör är
 * värdelös; en som lovar mer än koden gör är en lögn. Ändras behandlingen ska
 * den här sidan ändras i samma commit.
 *
 * Två saker är medvetet konkreta i stället för svepande: att bevakningslistan
 * kan vara affärskänslig, och att artiklarnas innehåll kommer från tredje part.
 */

const UPPDATERAD = "7 augusti 2026";

function Avsnitt({
  rubrik,
  children,
}: {
  rubrik: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
        {rubrik}
      </h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {children}
      </div>
    </section>
  );
}

export default function IntegritetspolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Integritetspolicy
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Senast uppdaterad {UPPDATERAD}.
      </p>

      <Avsnitt rubrik="Vem som ansvarar">
        <p>
          Kundnytt drivs av Oskar Östlind. Frågor om dina uppgifter, eller
          begäran om registerutdrag, går till{" "}
          <a
            className="underline underline-offset-4"
            href="mailto:oskarandreassen01@gmail.com"
          >
            oskarandreassen01@gmail.com
          </a>
          .
        </p>
      </Avsnitt>

      <Avsnitt rubrik="Vad vi lagrar">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Din mejladress.</strong> Den är både ditt användarnamn och
            adressen bevakningarna skickas till.
          </li>
          <li>
            <strong>Namnen på de bolag du bevakar.</strong>
          </li>
          <li>
            <strong>Rubriker, ingresser och länkar</strong> till artiklar och
            jobbannonser som matchat dina bevakningar, samt om du markerat dem
            som intressanta eller ointressanta.
          </li>
          <li>
            <strong>Inloggningssessioner</strong> och en tillfällig logg över
            begärda inloggningslänkar, som används för att förhindra missbruk.
          </li>
        </ul>
        <p>
          Vi lagrar inga lösenord — inloggningen sker med en engångslänk till
          din mejladress. Vi samlar inte in besöksstatistik och använder inga
          spårningskakor.
        </p>
      </Avsnitt>

      <Avsnitt rubrik="Varför, och med vilken rättslig grund">
        <p>
          Uppgifterna behandlas för att kunna leverera tjänsten du bett om,
          alltså <strong>fullgörande av avtal</strong> enligt artikel 6.1 b i
          dataskyddsförordningen. Loggen över inloggningsförsök behandlas med
          stöd av <strong>berättigat intresse</strong> enligt artikel 6.1 f — att
          hindra att någon skickar oönskade inloggningsmejl till andra.
        </p>
      </Avsnitt>

      <Avsnitt rubrik="Din bevakningslista kan vara känslig">
        <p>
          Listan över bolag du följer säger något om vilka kunder eller
          affärsmöjligheter du arbetar med. Det är inte en personuppgift i
          lagens mening, men det kan vara affärskänsligt. Vi delar den inte med
          någon, säljer den inte, och använder den inte till något annat än att
          söka nyheter åt dig.
        </p>
      </Avsnitt>

      <Avsnitt rubrik="Vilka som får se uppgifterna">
        <p>Tjänsten körs hos ett fåtal underleverantörer:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Vercel</strong> — drift av applikationen.
          </li>
          <li>
            <strong>Neon</strong> — databasen där uppgifterna lagras.
          </li>
          <li>
            <strong>Vår mejlleverantör</strong> — skickar inloggningslänkar och
            morgonmejl, och behandlar därmed din mejladress och innehållet i
            mejlen.
          </li>
        </ul>
        <p>
          Vi lämnar inte ut uppgifter till någon annan, utom när lag kräver det.
        </p>
      </Avsnitt>

      <Avsnitt rubrik="Var uppgifterna finns">
        <p>
          Databasen och mejlutskicken ligger inom EU. Delar av driften kan ske
          hos leverantörer med verksamhet utanför EU/EES, och sker då med stöd av
          EU-kommissionens standardavtalsklausuler.
        </p>
      </Avsnitt>

      <Avsnitt rubrik="Hur länge">
        <p>
          Så länge du har ett konto. Raderar du kontot försvinner allt
          omedelbart och permanent — mejladress, bevakningar, sparade artiklar
          och jobbannonser. Vi har ingen säkerhetskopia att återställa från.
          Loggen över inloggningsförsök rensas löpande och sparas som längst en
          timme.
        </p>
      </Avsnitt>

      <Avsnitt rubrik="Dina rättigheter">
        <p>
          Du har rätt att få veta vad vi lagrar, få det rättat, få det raderat,
          och få ut det i ett maskinläsbart format. Två av dem gör du själv
          direkt i tjänsten, under <strong>Konto och data</strong>: ladda ner
          allt som JSON, eller radera kontot. Övriga begäranden hanteras via
          mejladressen ovan.
        </p>
        <p>
          Är du missnöjd med hur vi hanterar dina uppgifter kan du klaga hos{" "}
          <a
            className="underline underline-offset-4"
            href="https://www.imy.se"
            target="_blank"
            rel="noreferrer"
          >
            Integritetsskyddsmyndigheten
          </a>
          .
        </p>
      </Avsnitt>

      <Avsnitt rubrik="Om innehållet i mejlen">
        <p>
          Nyhetsrubriker och länkar hämtas från offentliga nyhetsflöden, och
          jobbannonser från Arbetsförmedlingens öppna API. Vi ansvarar inte för
          riktigheten i det material tredje part publicerat, och länkarna leder
          till respektive publicists egen sajt.
        </p>
      </Avsnitt>

      <p className="mt-10 text-sm">
        <Link
          href="/"
          className="text-zinc-500 underline underline-offset-4 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Tillbaka till startsidan
        </Link>
      </p>
    </main>
  );
}
