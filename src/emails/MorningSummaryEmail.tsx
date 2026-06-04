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

interface MorningSummaryEmailProps {
  newsItems: MorningSummaryNewsItem[];
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
                Omvärldsbevakare
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
