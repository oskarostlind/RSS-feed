import nodemailer from "nodemailer";
import { Resend } from "resend";
import { formatErrorCause, formatErrorMessage } from "@/lib/utils/formatError";

/**
 * Utskicksvägen — SMTP eller Resend, valt av miljön.
 *
 * Varför inte bara en: Resends gratisnivå tillåter **en** verifierad domän, och
 * den platsen är upptagen av ett annat projekt. SMTP löser det utan att någon
 * behöver flytta något som fungerar, och gör dessutom leverantören till en
 * miljövariabel i stället för ett beroende i koden. Byter vi från Brevo till
 * något annat är det fyra variabler, inte en refaktorering.
 *
 * Resend ligger kvar som väg när `SMTP_HOST` saknas. Det är avsiktligt och inte
 * lättja: så länge produktionen går på Resend ska en halvgjord SMTP-konfiguration
 * inte tysta morgonmejlet. Vägen byts när variablerna finns, inte när koden
 * deployas.
 */

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  /** Ett HTML-bara mejl poängsätts som massutskick. Aldrig valfritt. */
  text: string;
}

export interface SentEmail {
  id: string;
  /** Vilken väg som faktiskt användes. Syns i cron-svaret vid felsökning. */
  via: "smtp" | "resend";
}

export class EmailTransportError extends Error {
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "EmailTransportError";
    this.cause = options?.cause;
  }
}

export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
}

/**
 * Alla fyra eller ingen. En halv SMTP-konfiguration är farligare än ingen alls:
 * den ser konfigurerad ut och fallerar först vid utskick, alltså kl 07.
 */
export function resolveSmtpSettings(
  env: NodeJS.ProcessEnv = process.env,
): SmtpSettings | null {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS?.trim();

  if (!host || !user || !pass) {
    return null;
  }

  const parsedPort = Number(env.SMTP_PORT);
  // 587 med STARTTLS är vad Brevo, SMTP2GO och de flesta andra vill ha.
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 587;

  return { host, port, user, pass };
}

async function sendViaSmtp(
  email: OutgoingEmail,
  settings: SmtpSettings,
): Promise<SentEmail> {
  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    // Port 465 är implicit TLS, 587 är STARTTLS. Att gissa fel ger en
    // hängande anslutning snarare än ett tydligt fel.
    secure: settings.port === 465,
    auth: { user: settings.user, pass: settings.pass },
  });

  const info = await transporter.sendMail({
    from: email.from,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  return { id: info.messageId, via: "smtp" };
}

async function sendViaResend(email: OutgoingEmail): Promise<SentEmail> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new EmailTransportError(
      "Varken SMTP_HOST/SMTP_USER/SMTP_PASS eller RESEND_API_KEY är satta — det finns ingen väg att skicka mejl.",
    );
  }

  const response = await new Resend(apiKey).emails.send({
    from: email.from,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  if (response.error) {
    throw new EmailTransportError(
      `Resend request failed: ${response.error.message}`,
      { cause: response.error },
    );
  }

  if (!response.data?.id) {
    throw new EmailTransportError(
      "Resend request succeeded but returned no email id",
    );
  }

  return { id: response.data.id, via: "resend" };
}

export async function sendEmail(email: OutgoingEmail): Promise<SentEmail> {
  const smtp = resolveSmtpSettings();

  try {
    return smtp ? await sendViaSmtp(email, smtp) : await sendViaResend(email);
  } catch (error) {
    if (error instanceof EmailTransportError) {
      throw error;
    }

    const detail = formatErrorCause(error) ?? formatErrorMessage(error);
    throw new EmailTransportError(
      `Utskick via ${smtp ? "SMTP" : "Resend"} misslyckades: ${detail}`,
      { cause: error },
    );
  }
}
