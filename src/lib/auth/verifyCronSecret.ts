import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Konstant-tidsjämförelse så att en angripare inte kan gissa hemligheten
 * tecken för tecken genom att mäta svarstider.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Plockar ut hemligheten från requesten. Tre former stöds:
 *
 *  1. `Authorization: Bearer <secret>` — Vercel Cron använder denna.
 *  2. `x-cron-secret: <secret>` — bekvämt vid manuell curl.
 *  3. `?secret=<secret>` — behövs för verktyg som inte kan sätta headers,
 *     t.ex. Vercel-MCP:ns URL-hämtning. Endast query-formen loggas aldrig.
 */
function extractProvidedSecret(request: Request): string | null {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  const cronHeader = request.headers.get("x-cron-secret");

  if (cronHeader) {
    return cronHeader.trim();
  }

  try {
    const querySecret = new URL(request.url).searchParams.get("secret");

    if (querySecret) {
      return querySecret.trim();
    }
  } catch {
    // Ogiltig URL — faller igenom till null nedan.
  }

  return null;
}

export function verifyCronSecret(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  const provided = extractProvidedSecret(request);

  if (!provided || !secretsMatch(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
