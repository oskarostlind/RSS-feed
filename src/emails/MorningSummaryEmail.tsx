import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import { formatNewsDate } from "@/lib/utils/formatDate";

export interface MorningSummaryNewsItem {
  id: string;
  title: string;
  snippet: string | null;
  url: string;
  companyName: string;
  publishedAt: Date | null;
}

export interface MorningSummaryJobAdItem {
  id: string;
  headline: string;
  employerName: string;
  occupation: string | null;
  municipality: string | null;
  url: string;
  companyName: string;
  publishedAt: Date | null;
}

interface MorningSummaryEmailProps {
  newsItems: MorningSummaryNewsItem[];
  /**
   * Artiklar där bolagsnamnet inte stod i rubriken — ofta lokalpress som
   * skriver "Ljusdalsföretag" i stället. De listas separat och kortfattat så
   * att de inte konkurrerar med de säkra träffarna.
   */
  possibleItems?: MorningSummaryNewsItem[];
  /**
   * Jobbannonser. Egen sektion och inte inblandade bland artiklarna, därför
   * att de besvarar en annan fråga: inte "vad har hänt" utan "vad förbereder
   * de". En AM läser dem med annan blick.
   */
  jobAds?: MorningSummaryJobAdItem[];
}

function buildJobAdSubtitle(item: MorningSummaryJobAdItem): string {
  return [item.occupation, item.municipality].filter(Boolean).join(" · ");
}

function buildPreviewText(newsItems: MorningSummaryNewsItem[]): string {
  if (newsItems.length === 1) {
    return "1 ny artikel hittades under nattens sökning.";
  }

  return `${newsItems.length} nya artiklar hittades under nattens sökning.`;
}

function buildArticleCountLabel(count: number): string {
  return count === 1 ? "1 ny artikel" : `${count} nya artiklar`;
}

export function MorningSummaryEmail({
  newsItems,
  possibleItems = [],
  jobAds = [],
}: MorningSummaryEmailProps) {
  const articleCountLabel = buildArticleCountLabel(newsItems.length);

  return (
    <Html lang="sv">
      <Head />
      <Preview>{buildPreviewText(newsItems)}</Preview>
      <Tailwind>
        <Body className="mx-auto bg-zinc-100 font-sans text-zinc-900">
          <Container className="mx-auto max-w-[640px] px-4 py-8">
            <Section className="mb-8 text-center">
              <Text className="m-0 mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
                Företagskollen
              </Text>
              <Heading className="m-0 mb-2 text-[28px] font-semibold leading-tight text-zinc-900">
                Morgonsammanfattning
              </Heading>
              <Text className="m-0 text-[15px] leading-6 text-zinc-600">
                {articleCountLabel} hittades under nattens sökning.
              </Text>
            </Section>

            {newsItems.map((item, index) => {
              const snippet =
                item.snippet?.trim() ||
                "Ingen beskrivning tillgänglig för denna artikel.";
              const displayDate = formatNewsDate(item.publishedAt);

              return (
                <Section key={item.id}>
                  <Section className="rounded-xl border border-solid border-zinc-200 bg-white px-6 py-5">
                    <Text className="m-0 mb-2 text-xs font-semibold uppercase tracking-[0.04em] text-zinc-500">
                      {item.companyName}
                    </Text>
                    <Heading
                      as="h2"
                      className="m-0 mb-3 text-lg font-semibold leading-snug text-zinc-900"
                    >
                      {item.title}
                    </Heading>
                    <Text className="m-0 mb-3 text-sm leading-6 text-zinc-600">
                      {snippet}
                    </Text>
                    <Text className="m-0 mb-4 text-[13px] text-zinc-500">
                      {displayDate}
                    </Text>
                    <Link
                      href={item.url}
                      className="text-sm font-semibold text-zinc-900 underline"
                    >
                      Läs originalartikel →
                    </Link>
                  </Section>

                  {index < newsItems.length - 1 ? (
                    <Hr className="my-6 border-zinc-200" />
                  ) : null}
                </Section>
              );
            })}

            {possibleItems.length > 0 ? (
              <Section className="mt-10">
                <Hr className="mb-6 border-zinc-200" />
                <Text className="m-0 mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
                  Kanske relevant
                </Text>
                <Text className="m-0 mb-4 text-[13px] leading-5 text-zinc-500">
                  Artiklar som matchade sökningen men inte nämner bolaget vid
                  namn i rubriken. Bedöm dem i dashboarden.
                </Text>

                {possibleItems.map((item) => (
                  <Section key={item.id} className="mb-3">
                    <Text className="m-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-zinc-400">
                      {item.companyName}
                    </Text>
                    <Link
                      href={item.url}
                      className="text-sm leading-5 text-zinc-700 underline"
                    >
                      {item.title}
                    </Link>
                  </Section>
                ))}
              </Section>
            ) : null}

            {jobAds.length > 0 ? (
              <Section className="mt-10">
                <Hr className="mb-6 border-zinc-200" />
                <Text className="m-0 mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
                  Nya jobbannonser
                </Text>
                <Text className="m-0 mb-4 text-[13px] leading-5 text-zinc-500">
                  Rekrytering syns i Platsbanken innan den syns i pressen.
                  Flera annonser på samma ort är oftast en expansion.
                </Text>

                {jobAds.map((item) => {
                  const subtitle = buildJobAdSubtitle(item);

                  return (
                    <Section
                      key={item.id}
                      className="mb-3 rounded-lg border border-solid border-zinc-200 bg-white px-4 py-3"
                    >
                      <Text className="m-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-zinc-400">
                        {item.companyName}
                      </Text>
                      <Link
                        href={item.url}
                        className="text-sm font-semibold leading-5 text-zinc-900 underline"
                      >
                        {item.headline}
                      </Link>
                      {subtitle ? (
                        <Text className="m-0 mt-1 text-[13px] leading-5 text-zinc-500">
                          {subtitle}
                        </Text>
                      ) : null}
                    </Section>
                  );
                })}
              </Section>
            ) : null}

            <Section className="mt-8 text-center">
              <Text className="m-0 text-xs leading-5 text-zinc-400">
                Detta mejl skickades automatiskt efter cron-jobbets nattliga
                nyhetssökning.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export default MorningSummaryEmail;
