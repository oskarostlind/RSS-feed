import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

export interface SourceAlertRow {
  source: string;
  verdict: string;
  note: string;
}

interface SourceAlertEmailProps {
  rows: SourceAlertRow[];
  ranAt: Date;
}

/**
 * Larmmejl när en källa tystnat eller gått sönder.
 *
 * Avsiktligt torftigt. Det här är inte ett mejl någon ska vilja läsa, det är
 * ett mejl som ska gå att förstå på fem sekunder klockan sju på morgonen:
 * vilken källa, vad som hände, vad man gör åt det.
 */
export function SourceAlertEmail({ rows, ranAt }: SourceAlertEmailProps) {
  const names = rows.map((row) => row.source).join(", ");

  return (
    <Html lang="sv">
      <Head />
      <Preview>{`Bevakningen är inte fullständig: ${names}`}</Preview>
      <Tailwind>
        <Body className="mx-auto bg-zinc-100 font-sans text-zinc-900">
          <Container className="mx-auto max-w-[560px] px-4 py-8">
            <Section className="rounded-xl border border-solid border-red-200 bg-white px-6 py-5">
              <Text className="m-0 mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-red-600">
                Kundnytt — källvarning
              </Text>
              <Heading className="m-0 mb-3 text-xl font-semibold leading-tight text-zinc-900">
                {rows.length === 1
                  ? "En källa levererade inte i natt"
                  : `${rows.length} källor levererade inte i natt`}
              </Heading>
              <Text className="m-0 mb-4 text-sm leading-6 text-zinc-600">
                Morgonkörningen gick igenom, men nedanstående källor bidrog
                ingenting. Nyheter kan alltså ha missats utan att det syns på
                morgonmejlet.
              </Text>

              {rows.map((row) => (
                <Section key={row.source} className="mb-3">
                  <Text className="m-0 text-sm font-semibold text-zinc-900">
                    {row.source} — {row.verdict}
                  </Text>
                  <Text className="m-0 text-sm leading-5 text-zinc-600">
                    {row.note}
                  </Text>
                </Section>
              ))}

              <Text className="m-0 mt-4 text-[13px] leading-5 text-zinc-500">
                Kör /api/debug/source-test med ?probe=1 för att se vad källan
                faktiskt svarade.
              </Text>
            </Section>

            <Text className="mt-4 text-center text-xs text-zinc-400">
              {ranAt.toISOString()}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export default SourceAlertEmail;
