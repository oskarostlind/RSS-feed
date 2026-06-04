import { Resend } from "resend";
import { formatNewsDate } from "@/lib/utils/formatDate";

const DEFAULT_FROM_EMAIL = "onboarding@resend.dev";

export interface MorningSummaryNewsItem {
  id: string;
  title: string;
  snippet: string | null;
  url: string;
  companyName: string;
  publishedAt: Date | null;
}

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

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildMorningSummaryHtml(newsItems: MorningSummaryNewsItem[]): string {
  const articleRows = newsItems
    .map((item) => {
      const snippet =
        item.snippet?.trim() ||
        "Ingen beskrivning tillgänglig för denna artikel.";
      const displayDate = formatNewsDate(item.publishedAt);

      return `
        <tr>
          <td style="padding: 0 0 24px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e4e4e7; border-radius: 12px; background-color: #ffffff;">
              <tr>
                <td style="padding: 20px 24px;">
                  <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #059669;">
                    ${escapeHtml(item.companyName)}
                  </p>
                  <h2 style="margin: 0 0 10px 0; font-size: 18px; line-height: 1.4; color: #18181b;">
                    <a href="${escapeHtml(item.url)}" style="color: #18181b; text-decoration: none;">
                      ${escapeHtml(item.title)}
                    </a>
                  </h2>
                  <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.6; color: #52525b;">
                    ${escapeHtml(snippet)}
                  </p>
                  <p style="margin: 0 0 12px 0; font-size: 13px; color: #71717a;">
                    ${escapeHtml(displayDate)}
                  </p>
                  <a href="${escapeHtml(item.url)}" style="display: inline-block; font-size: 14px; font-weight: 600; color: #059669; text-decoration: none;">
                    Läs originalartikel →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join("");

  const articleCountLabel =
    newsItems.length === 1 ? "1 ny artikel" : `${newsItems.length} nya artiklar`;

  return `<!DOCTYPE html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Morgonsammanfattning</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: Arial, Helvetica, sans-serif; color: #18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 640px;">
            <tr>
              <td style="padding: 0 0 24px 0; text-align: center;">
                <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #059669;">
                  Omvärldsbevakare
                </p>
                <h1 style="margin: 0 0 8px 0; font-size: 28px; line-height: 1.2; color: #18181b;">
                  Morgonsammanfattning
                </h1>
                <p style="margin: 0; font-size: 15px; line-height: 1.5; color: #52525b;">
                  ${escapeHtml(articleCountLabel)} hittades under nattens sökning.
                </p>
              </td>
            </tr>
            ${articleRows}
            <tr>
              <td style="padding-top: 8px; text-align: center;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #a1a1aa;">
                  Detta mejl skickades automatiskt efter cron-jobbets nattliga nyhetssökning.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export class EmailService {
  private readonly resend: Resend;
  private readonly adminEmail: string;
  private readonly fromEmail: string;

  constructor(options: {
    apiKey: string;
    adminEmail: string;
    fromEmail?: string;
  }) {
    this.resend = new Resend(options.apiKey);
    this.adminEmail = options.adminEmail;
    this.fromEmail = options.fromEmail ?? DEFAULT_FROM_EMAIL;
  }

  static fromEnv(): EmailService {
    const apiKey = process.env.RESEND_API_KEY;
    const adminEmail = process.env.ADMIN_EMAIL;

    if (!apiKey) {
      throw new EmailServiceError(
        "Missing environment variable: RESEND_API_KEY",
      );
    }

    if (!adminEmail) {
      throw new EmailServiceError("Missing environment variable: ADMIN_EMAIL");
    }

    return new EmailService({ apiKey, adminEmail });
  }

  async sendMorningSummary(
    newsItems: MorningSummaryNewsItem[],
  ): Promise<SendMorningSummaryResult> {
    if (newsItems.length === 0) {
      throw new EmailServiceError(
        "sendMorningSummary requires at least one news item",
      );
    }

    const subject =
      newsItems.length === 1
        ? "Morgonsammanfattning – 1 ny artikel"
        : `Morgonsammanfattning – ${newsItems.length} nya artiklar`;

    try {
      const response = await this.resend.emails.send({
        from: this.fromEmail,
        to: this.adminEmail,
        subject,
        html: buildMorningSummaryHtml(newsItems),
      });

      if (response.error) {
        throw new EmailServiceError(
          `Resend request failed: ${response.error.message}`,
          { cause: response.error },
        );
      }

      if (!response.data?.id) {
        throw new EmailServiceError(
          "Resend request succeeded but returned no email id",
        );
      }

      return { id: response.data.id };
    } catch (error) {
      if (error instanceof EmailServiceError) {
        throw error;
      }

      throw new EmailServiceError("Failed to send morning summary email", {
        cause: error,
      });
    }
  }
}
