/**
 * Minimal typdeklaration för nodemailer.
 *
 * `@types/nodemailer` finns men är inte installerat, och `npm install` från
 * den här miljön är inte gratis: `node_modules` är byggt för Windows, så en
 * installation från Linux skriver in inkompatibla binärer i samma träd. Samma
 * skäl som gjorde att `unzip.ts` skrevs för hand — se PROJECT.md avsnitt 5.
 *
 * Deklarationen täcker precis det `transport.ts` använder, och inte mer. Växer
 * användningen ska den växa med, eller ersättas av det riktiga typpaketet
 * nästa gång någon kör `npm install` från Windows.
 */
declare module "nodemailer" {
  export interface SmtpAuth {
    user: string;
    pass: string;
  }

  export interface SmtpTransportOptions {
    host: string;
    port: number;
    /** Implicit TLS. Sant för 465, falskt för 587 med STARTTLS. */
    secure: boolean;
    auth: SmtpAuth;
  }

  export interface MailOptions {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    /** Egna huvuden, i praktiken List-Unsubscribe och List-Unsubscribe-Post. */
    headers?: Record<string, string>;
  }

  export interface SentMessageInfo {
    messageId: string;
    accepted: string[];
    rejected: string[];
    response: string;
  }

  export interface Transporter {
    sendMail(options: MailOptions): Promise<SentMessageInfo>;
    verify(): Promise<true>;
  }

  export function createTransport(
    options: SmtpTransportOptions,
  ): Transporter;

  const nodemailer: {
    createTransport: typeof createTransport;
  };

  export default nodemailer;
}
