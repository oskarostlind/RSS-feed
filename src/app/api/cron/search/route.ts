import { NextResponse } from "next/server";
import { buildSearchErrorResponse } from "@/lib/api/searchErrorResponse";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
import {
  EmailService,
  EmailServiceError,
} from "@/lib/email/EmailService";
import { executeDiscoveryJob } from "@/lib/search/executeDiscoveryJob";
import { SearchServiceError } from "@/lib/search/SearchService";

export async function GET(request: Request): Promise<NextResponse> {
  const unauthorized = verifyCronSecret(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const result = await executeDiscoveryJob();
    let emailSent = false;
    let emailId: string | null = null;
    let emailError: string | null = null;

    if (result.createdNewsItems.length > 0) {
      try {
        const emailService = EmailService.fromEnv();
        const sendResult = await emailService.sendMorningSummary(
          result.createdNewsItems,
        );
        emailSent = true;
        emailId = sendResult.id;
        console.log(
          `Morning summary email sent to admin (${sendResult.id}) with ${result.createdNewsItems.length} new articles.`,
        );
      } catch (error) {
        if (error instanceof EmailServiceError) {
          emailError = error.message;
          console.error("Failed to send morning summary email:", error);
        } else {
          emailError = "Failed to send morning summary email";
          console.error("Failed to send morning summary email:", error);
        }
      }
    } else {
      console.log("Morning summary email skipped: no new articles found.");
    }

    return NextResponse.json({
      ...result,
      emailSent,
      emailId,
      emailError,
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
