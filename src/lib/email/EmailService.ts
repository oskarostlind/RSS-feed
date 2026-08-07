import { Resend } from "resend";
import {
  MorningSummaryEmail,
  type MorningSummaryJobAdItem,
  type MorningSummaryNewsItem,
} from "@/emails/MorningSummaryEmail";
import {
  formatErrorCause,
  formatErrorMessage,
} from "@/lib/utils/formatError";

const DEFAULT_FROM_EMAIL = "onboarding@resend.dev";

export type { MorningSummaryJobAdItem, MorningSummaryNewsItem };

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
    options?: {
      to?: string;
      possibleItems?: MorningSummaryNewsItem[];
      jobAds?: MorningSummaryJobAdItem[];
    },
  ): Promise<SendMorningSummaryResult> {
    const possibleItems = options?.possibleItems ?? [];
    const jobAds = options?.jobAds ?? [];

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
      const response = await this.resend.emails.send({
        from: this.fromEmail,
        to: recipient,
        subject,
        react: MorningSummaryEmail({ newsItems, possibleItems, jobAds }),
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

      const causeMessage = formatErrorCause(error) ?? formatErrorMessage(error);
      throw new EmailServiceError(
        `Failed to send morning summary email: ${causeMessage}`,
        { cause: error },
      );
    }
  }
}
