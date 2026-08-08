import { resolveFromAddress } from "@/lib/email/sender";
import { sendEmail } from "@/lib/email/transport";

/**
 * Mejlen som hör till kontot: verifiering och lösenordsåterställning.
 *
 * **Formen är medvetet lugn.** 2026-08-08 spärrade Chrome en av tjänstens
 * inloggningslänkar som nätfiske. En del av orsaken låg i URL:en och är löst
 * i `authTokenSecret.ts`, men resten ligger i mejlet: ett kort brev som bara
 * säger "klicka här för att logga in" med en stor svart knapp är precis vad
 * ett nätfiskemejl också gör.
 *
 * Därför är de här mejlen skrivna för att se ut som post från en tjänst man
 * känner igen: vad som begärdes, vilken adress det gäller, hur länge länken
 * gäller, och vad man gör om man inte bett om det. Adressen står i brödtexten
 * i stället för i URL:en — den behöver mottagaren se, klassificeraren behöver
 * den inte.
 *
 * Textdel i varje utskick, av samma skäl som resten av tjänsten: ett HTML-bara
 * mejl är det som fick Gmail att kasta utskicken 2026-08-07.
 */

interface AuthEmailContent {
  rubrik: string;
  ingress: string;
  knapp: string;
  giltighet: string;
  avslutning: string;
}

function buildText(
  content: AuthEmailContent,
  email: string,
  url: string,
): string {
  return [
    content.rubrik,
    "",
    content.ingress,
    `Kontot gäller ${email}.`,
    content.giltighet,
    "",
    url,
    "",
    content.avslutning,
    "",
    "Kundnytt — bevakning av kundbolag i svensk nyhetsmedia",
    "https://www.kundnytt.se",
  ].join("\n");
}

function buildHtml(
  content: AuthEmailContent,
  email: string,
  url: string,
): string {
  return `<!DOCTYPE html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${content.rubrik}</title>
  </head>
  <body style="margin: 0; padding: 32px 16px; background-color: #f4f4f5; font-family: Arial, Helvetica, sans-serif; color: #18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px;">
            <tr>
              <td style="padding: 32px 28px;">
                <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #71717a;">
                  Kundnytt
                </p>
                <h1 style="margin: 0 0 12px 0; font-size: 22px; line-height: 1.3; color: #18181b;">
                  ${content.rubrik}
                </h1>
                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #52525b;">
                  ${content.ingress}
                </p>
                <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #52525b;">
                  Kontot gäller <strong style="color: #18181b;">${email}</strong>.
                  ${content.giltighet}
                </p>
                <a href="${url}" style="display: inline-block; border-radius: 8px; background-color: #18181b; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 20px;">
                  ${content.knapp}
                </a>
                <p style="margin: 24px 0 0 0; font-size: 13px; line-height: 1.6; color: #71717a;">
                  ${content.avslutning}
                </p>
                <hr style="margin: 24px 0 16px 0; border: none; border-top: 1px solid #e4e4e7;" />
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #a1a1aa;">
                  Kundnytt bevakar kundbolag i svensk lokal- och branschpress.
                  <a href="https://www.kundnytt.se" style="color: #71717a;">www.kundnytt.se</a>
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

async function send(
  to: string,
  subject: string,
  content: AuthEmailContent,
  url: string,
): Promise<void> {
  await sendEmail({
    from: resolveFromAddress(),
    to,
    subject,
    html: buildHtml(content, to, url),
    text: buildText(content, to, url),
  });
}

export async function sendVerificationEmail(
  email: string,
  url: string,
): Promise<void> {
  await send(email, "Bekräfta din adress i Kundnytt", {
    rubrik: "Bekräfta din adress",
    ingress: "Du har skapat ett konto i Kundnytt och behöver bekräfta adressen innan du kan logga in.",
    knapp: "Bekräfta adressen",
    giltighet: "Länken gäller i 24 timmar.",
    avslutning:
      "Har du inte skapat något konto behöver du inte göra något — utan bekräftelse blir kontot aldrig aktivt, och vi skickar inga fler mejl.",
  }, url);
}

export async function sendPasswordResetEmail(
  email: string,
  url: string,
): Promise<void> {
  await send(email, "Återställ ditt lösenord i Kundnytt", {
    rubrik: "Återställ ditt lösenord",
    ingress: "Någon har begärt ett nytt lösenord till ditt Kundnytt-konto.",
    knapp: "Välj nytt lösenord",
    giltighet: "Länken gäller i en timme och kan bara användas en gång.",
    avslutning:
      "Har du inte begärt det här kan du bortse från mejlet. Ditt nuvarande lösenord fortsätter gälla och ingenting har ändrats.",
  }, url);
}
