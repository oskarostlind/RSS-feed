import {
  SourceAlertEmail,
  type SourceAlertRow,
} from "@/emails/SourceAlertEmail";
import {
  MorningSummaryEmail,
  type MorningSummaryJobAdItem,
  type MorningSummaryNewsItem,
} from "@/emails/MorningSummaryEmail";
import {
  formatErrorCause,
  formatErrorMessage,
} from "@/lib/utils/formatError";
import { render } from "@react-email/render";
import { resolveFromAddress } from "@/lib/email/sender";
import { sendEmail } from "@/lib/email/transport";


export type { MorningSummaryJobAdItem, MorningSummaryNewsItem, SourceAlertRow };

export interface SendMorningSummaryResult {
  id: string;
}

export class EmailServiceError extends Error {
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "EmailServiceError";
    this.cause = options?.cause;
  }
}

/**
 * Ämnesraden avgör om mejlet öppnas. Den ska därför säga vad som faktiskt
 * finns i det — inte "sammanfattning" när det bara är en jobbannons.
 */
function buildMorningSubject(newsCount: number, jobCount: number): string {
  const parts: string[] = [];

  if (newsCount > 0) {
    parts.push(newsCount === 1 ? "1 ny artikel" : `${newsCount} nya artiklar`);
  }

  if (jobCount > 0) {
    parts.push(
      jobCount === 1 ? "1 ny jobbannons" : `${jobCount} nya jobbannonser`,
    );
  }

  return `Morgonsammanfattning – ${parts.join(", ")}`;
}

/**
 * Huvudena som ger Gmail och Outlook en egen avregistreringsknapp vid
 * avsändarnamnet (RFC 8058 respektive RFC 2369).
 *
 * De två hör ihop: `List-Unsubscribe-Post` är det som gör knappen till ett
 * klick i stället för en omväg via webbläsaren, men den räknas bara när
 * `List-Unsubscribe` också bär en `https`-URL. `mailto:` utelämnas medvetet —
 * vi har ingen inkorg som läser och behandlar sådana, och ett huvud som lovar
 * något vi inte gör är sämre än inget huvud.
 */
function buildListUnsubscribeHeaders(
  unsubscribeUrl: string | null,
): Record<string, string> | undefined {
  if (!unsubscribeUrl) {
    return undefined;
  }

  // Enklicksvägen är API-rutten, inte bekräftelsesidan: klienten förväntar sig
  // en tom 200 och tolkar en HTML-sida som misslyckande.
  const oneClick = unsubscribeUrl.replace("/avregistrera?", "/api/avregistrera?");

  return {
    "List-Unsubscribe": `<${oneClick}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

function buildMorningSummaryText(
  newsItems: MorningSummaryNewsItem[],
  possibleItems: MorningSummaryNewsItem[],
  jobAds: MorningSummaryJobAdItem[],
  unsubscribeUrl: string | null,
): string {
  const lines: string[] = ["Morgonsammanfattning", ""];

  if (newsItems.length > 0) {
    lines.push("NYHETER");
    for (const item of newsItems) {
      lines.push(`- ${item.companyName}: ${item.title}`, `  ${item.url}`);
    }
    lines.push("");
  }

  if (jobAds.length > 0) {
    lines.push("NYA JOBBANNONSER");
    for (const ad of jobAds) {
      const where = [ad.occupation, ad.municipality].filter(Boolean).join(", ");
      lines.push(
        `- ${ad.companyName}: ${ad.headline}${where ? ` (${where})` : ""}`,
        `  ${ad.url}`,
      );
    }
    lines.push("");
  }

  if (possibleItems.length > 0) {
    lines.push("KANSKE RELEVANT");
    for (const item of possibleItems) {
      lines.push(`- ${item.companyName}: ${item.title}`, `  ${item.url}`);
    }
  }

  if (unsubscribeUrl) {
    lines.push("", "Avsluta morgonmejlet:", unsubscribeUrl);
  }

  return lines.join("\n");
}

export class EmailService {
  private readonly adminEmail: string;
  private readonly fromEmail: string;

  constructor(options: { adminEmail: string; fromEmail?: string }) {
    this.adminEmail = options.adminEmail;
    this.fromEmail = options.fromEmail ?? resolveFromAddress();
  }

  static fromEnv(): EmailService {
    const adminEmail = process.env.ADMIN_EMAIL;

    if (!adminEmail) {
      throw new EmailServiceError("Missing environment variable: ADMIN_EMAIL");
    }

    // Nycklarna för själva utskicket kontrolleras i `transport.ts`, som är den
    // enda som vet vilken väg som gäller.
    return new EmailService({ adminEmail });
  }

  async sendMorningSummary(
    newsItems: MorningSummaryNewsItem[],
    options?: {
      to?: string;
      possibleItems?: MorningSummaryNewsItem[];
      jobAds?: MorningSummaryJobAdItem[];
      /**
       * Färdigbyggd av anroparen, som är den enda som känner både användarens
       * id och tjänstens publika adress. Null när den inte gick att bygga —
       * mejlet skickas ändå, men utan länk.
       */
      unsubscribeUrl?: string | null;
    },
  ): Promise<SendMorningSummaryResult> {
    const possibleItems = options?.possibleItems ?? [];
    const jobAds = options?.jobAds ?? [];
    const unsubscribeUrl = options?.unsubscribeUrl ?? null;

    // En morgon utan artiklar men med nya jobbannonser är fortfarande värd ett
    // mejl — rekryteringen är hela poängen med den källan.
    if (newsItems.length === 0 && jobAds.length === 0) {
      throw new EmailServiceError(
        "sendMorningSummary requires at least one news item or job ad",
      );
    }

    const recipient = options?.to ?? this.adminEmail;
    const subject = buildMorningSubject(newsItems.length, jobAds.length);

    try {
      // Renderas här i stället för att skickas som React till Resend: SMTP
      // tar bara färdig HTML, och båda vägarna ska få exakt samma mejl.
      const html = await render(
        MorningSummaryEmail({ newsItems, possibleItems, jobAds, unsubscribeUrl }),
      );

      const sent = await sendEmail({
        from: this.fromEmail,
        to: recipient,
        subject,
        html,
        // Textalternativ, av samma skäl som för inloggningsmejlet: ett
        // HTML-bara mejl ser ut som massutskick för spamfiltren.
        text: buildMorningSummaryText(
          newsItems,
          possibleItems,
          jobAds,
          unsubscribeUrl,
        ),
        headers: buildListUnsubscribeHeaders(unsubscribeUrl),
      });

      return { id: sent.id };
    } catch (error) {
      if (error instanceof EmailServiceError) {
        throw error;
      }

      const causeMessage = formatErrorCause(error) ?? formatErrorMessage(error);
      throw new EmailServiceError(
        `Failed to send morning summary email: ${causeMessage}`,
        { cause: error },
      );
    }
  }

  /**
   * Larm om att en källa inte levererade.
   *
   * Går till `ADMIN_EMAIL` och inte till användarna. Det är ett driftlarm, inte
   * en produktegenskap — en AM ska inte behöva veta vad google-rss är, bara
   * kunna lita på att mejlet kommer. Den dagen tjänsten har riktiga kunder ska
   * det här mejlet gå till den som kan laga felet, inte till dem som drabbas.
   */
  async sendSourceAlert(
    rows: SourceAlertRow[],
  ): Promise<SendMorningSummaryResult> {
    if (rows.length === 0) {
      throw new EmailServiceError("sendSourceAlert requires at least one row");
    }

    const names = rows.map((row) => row.source).join(", ");

    try {
      const html = await render(SourceAlertEmail({ rows, ranAt: new Date() }));

      const sent = await sendEmail({
        from: this.fromEmail,
        to: this.adminEmail,
        subject: `Kundnytt: ${names} levererade inte`,
        html,
        text: [
          "Källvarning från Kundnytt",
          "",
          ...rows.map((row) => `${row.source} [${row.verdict}]: ${row.note}`),
        ].join("\n"),
      });

      return { id: sent.id };
    } catch (error) {
      if (error instanceof EmailServiceError) {
        throw error;
      }

      const causeMessage = formatErrorCause(error) ?? formatErrorMessage(error);
      throw new EmailServiceError(
        `Failed to send source alert email: ${causeMessage}`,
        { cause: error },
      );
    }
  }
}
