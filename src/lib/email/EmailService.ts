import { Resend } from "resend";
import {
  MorningSummaryEmail,
  type MorningSummaryNewsItem,
} from "@/emails/MorningSummaryEmail";

const DEFAULT_FROM_EMAIL = "onboarding@resend.dev";

export type { MorningSummaryNewsItem };

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
        react: MorningSummaryEmail({ newsItems }),
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
