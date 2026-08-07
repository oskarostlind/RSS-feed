import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Email from "next-auth/providers/email";
import { redirect } from "next/navigation";
import { resolveFromAddress } from "@/lib/email/sender";
import { sendEmail } from "@/lib/email/transport";
import { prisma } from "@/lib/prisma";

/**
 * Avsändaren hämtas ur den gemensamma konfigurationen i `email/sender.ts`.
 *
 * Låg tidigare hårdkodad här och en gång till i `EmailService`. Två ställen
 * betyder att domänbytet kan göras halvt, och just inloggningsmejlet är det som
 * absolut inte får bli kvar på sandlådedomänen — det är det enda mejl en ny
 * användare måste få för att komma in alls.
 */
function magicLinkFrom(): string {
  return resolveFromAddress();
}

function buildMagicLinkEmailText(url: string): string {
  return [
    "Logga in på Företagskollen",
    "",
    "Öppna länken nedan för att logga in. Den är giltig i 24 timmar och kan",
    "bara användas en gång.",
    "",
    url,
    "",
    "Har du inte begärt någon inloggning kan du bortse från det här mejlet.",
  ].join("\n");
}

function buildMagicLinkEmailHtml(url: string): string {
  return `<!DOCTYPE html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Logga in</title>
  </head>
  <body style="margin: 0; padding: 32px 16px; background-color: #f4f4f5; font-family: Arial, Helvetica, sans-serif; color: #18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px;">
            <tr>
              <td style="padding: 32px 28px;">
                <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #71717a;">
                  Företagskollen
                </p>
                <h1 style="margin: 0 0 12px 0; font-size: 24px; line-height: 1.3; color: #18181b;">
                  Logga in
                </h1>
                <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #52525b;">
                  Klicka på knappen nedan för att logga in. Länken är giltig i 24 timmar.
                </p>
                <a href="${url}" style="display: inline-block; border-radius: 8px; background-color: #18181b; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 20px;">
                  Logga in
                </a>
                <p style="margin: 24px 0 0 0; font-size: 12px; line-height: 1.5; color: #a1a1aa;">
                  Om du inte begärde detta mejl kan du ignorera det.
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

/**
 * Kastar en ogiltig `AUTH_URL` innan Auth.js hinner läsa den.
 *
 * Produktionsmiljön hade `https://rss-feed-lime.vercel.` — en avklippt
 * inklistring som tappat `app`. Auth.js bygger både omdirigeringar och den
 * magiska länken ur det värdet, så varje inloggningsmejl pekade på en adress
 * som inte finns. Ett värdnamn som slutar med punkt kan aldrig vara riktigt.
 *
 * Vi raderar hellre variabeln än litar på den: med `trustHost` härleder Auth.js
 * rätt adress ur requestens `x-forwarded-host`, vilket alltid stämmer på
 * Vercel. Rätta gärna variabeln ändå — det här är ett skyddsnät, inte en fix.
 */
function discardInvalidAuthUrl(): void {
  const raw = process.env.AUTH_URL?.trim();

  if (!raw) {
    return;
  }

  try {
    const { hostname } = new URL(raw);

    if (!hostname.endsWith(".")) {
      return;
    }
  } catch {
    // Går den inte att tolka som URL är den oanvändbar — fall igenom.
  }

  console.warn(
    `AUTH_URL är ogiltig ("${raw}") och ignoreras. Adressen härleds från requesten i stället.`,
  );
  delete process.env.AUTH_URL;
}

discardInvalidAuthUrl();

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Email({
      server: {
        host: "smtp.resend.com",
        port: 465,
        auth: {
          user: "resend",
          pass: process.env.RESEND_API_KEY ?? "unused",
        },
      },
      from: magicLinkFrom(),
      // Egen utskicksväg i stället för Auth.js inbyggda nodemailer-anrop.
      // Den inbyggda skickar en engelsk standardmall utan textdel, och det är
      // just avsaknaden av textdel som fick Gmail att kasta mejlen 2026-08-07.
      sendVerificationRequest: async ({ identifier, url }) => {
        await sendEmail({
          from: magicLinkFrom(),
          to: identifier,
          subject: "Din inloggningslänk till Företagskollen",
          html: buildMagicLinkEmailHtml(url),
          text: buildMagicLinkEmailText(url),
        });
      },
    }),
  ],
  session: {
    strategy: "database",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  trustHost: true,
});

export async function getRequiredUserId(): Promise<string> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return session.user.id;
}
