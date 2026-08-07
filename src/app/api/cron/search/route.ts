import { NextResponse } from "next/server";
import { buildSearchErrorResponse } from "@/lib/api/searchErrorResponse";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
import { EmailService, EmailServiceError } from "@/lib/email/EmailService";
import { executeDiscoveryJob } from "@/lib/search/executeDiscoveryJob";
import { SearchServiceError } from "@/lib/search/SearchService";
import type { SourceHealthReport } from "@/lib/search/sourceHealth";
import {
  formatErrorCause,
  formatErrorMessage,
} from "@/lib/utils/formatError";

export const maxDuration = 60;

interface EmailDeliveryReport {
  userId: string;
  email: string;
  articleCount: number;
  possibleCount: number;
  jobAdCount: number;
  sent: boolean;
  emailId: string | null;
  error: string | null;
  skippedReason: string | null;
}

/**
 * En tyst källa är allvarligare än en trasig. En trasig kastar fel och syns;
 * en tyst svarar HTTP 200 med noll poster och ser ut som "inga nyheter".
 * Därför `console.error` och inte `console.log` — den ska sticka ut i Vercels
 * loggöversikt utan att någon letar efter den.
 */
function logSourceHealth(health: SourceHealthReport): void {
  for (const source of health.sources) {
    if (source.verdict === "silent" || source.verdict === "failing") {
      console.error(`KÄLLA ${source.source} [${source.verdict}]: ${source.note}`);
    }
  }

  if (health.healthy) {
    console.log(
      `Källor ok: ${health.sources
        .map((source) => `${source.source}=${source.totalHits}`)
        .join(" ")}`,
    );
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const unauthorized = verifyCronSecret(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const result = await executeDiscoveryJob();
    const deliveries: EmailDeliveryReport[] = [];

    // Instansieras en gång — men bara om det finns något att mejla, så att en
    // saknad RESEND_API_KEY inte sänker en körning utan nya artiklar.
    let emailService: EmailService | null = null;

    for (const user of result.perUser) {
      const base = {
        userId: user.userId,
        email: user.email,
        articleCount: user.createdNewsItems.length,
        possibleCount: user.possibleNewsItems.length,
        jobAdCount: user.createdJobAds.length,
      };

      // Jobbannonser räknas som skäl att mejla. En morgon där bolaget lagt ut
      // tre nya tjänster är en signal även om pressen är tyst.
      if (
        user.createdNewsItems.length === 0 &&
        user.createdJobAds.length === 0
      ) {
        deliveries.push({
          ...base,
          sent: false,
          emailId: null,
          error: null,
          skippedReason: "no-new-items",
        });
        continue;
      }

      if (!user.emailDeliverable) {
        deliveries.push({
          ...base,
          sent: false,
          emailId: null,
          error: null,
          skippedReason: "undeliverable-address",
        });
        continue;
      }

      try {
        emailService ??= EmailService.fromEnv();

        const sendResult = await emailService.sendMorningSummary(
          user.createdNewsItems,
          {
            to: user.email,
            possibleItems: user.possibleNewsItems,
            jobAds: user.createdJobAds,
          },
        );

        console.log(
          `Morning summary sent to ${user.email} (${sendResult.id}) with ${user.createdNewsItems.length} articles and ${user.createdJobAds.length} job ads.`,
        );

        deliveries.push({
          ...base,
          sent: true,
          emailId: sendResult.id,
          error: null,
          skippedReason: null,
        });
      } catch (error) {
        const message =
          error instanceof EmailServiceError
            ? error.message
            : formatErrorMessage(error);
        const causeMessage = formatErrorCause(error);

        console.error(`Failed to send morning summary to ${user.email}:`, error);
        if (causeMessage) {
          console.error("Cause:", causeMessage);
        }

        deliveries.push({
          ...base,
          sent: false,
          emailId: null,
          error: message,
          skippedReason: null,
        });
      }
    }

    // Loggas före mejlrapporten, eftersom en tyst källa förklarar varför
    // mejlet blev tunt — och en tunn morgon utan förklaring är precis vad som
    // gör att ett larm behövs.
    logSourceHealth(result.sourceHealth);

    if (result.companiesSkippedForTime > 0) {
      // Loggas som fel och inte som info: det betyder att bevakningar tyst
      // hoppades över, vilket är precis den sortens sak som annars upptäcks
      // först när någon undrar var deras nyheter tog vägen.
      console.error(
        `Tidsbudgeten räckte inte till ${result.companiesSkippedForTime} bolag. ` +
          `Höj DISCOVERY_CONCURRENCY eller dela körningen.`,
      );
    }

    return NextResponse.json({
      ...result,
      emailsSent: deliveries.filter((delivery) => delivery.sent).length,
      deliveries,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "COMPANY_NOT_FOUND") {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (error instanceof Error && error.message === "NO_COMPANIES") {
      return NextResponse.json(
        { error: "No companies in database. Run prisma db seed first." },
        { status: 404 },
      );
    }

    if (error instanceof SearchServiceError) {
      return NextResponse.json(buildSearchErrorResponse(error), {
        status: 502,
      });
    }

    console.error("Cron discovery job failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
