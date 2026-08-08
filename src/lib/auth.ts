import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Sessionsläsning. Tjänstens enda källa till "vem är inloggad".
 *
 * **Auth.js är borttaget ur körvägen 2026-08-08.** Modulen exporterade tidigare
 * `auth()` och `getRequiredUserId()` från NextAuth med en e-postleverantör för
 * magiska länkar. Signaturerna är oförändrade med flit — fjorton anropare i
 * appen importerar dem, och ingen av dem behövde röras.
 *
 * Tre skäl till att det försvann:
 *
 * 1. **Magiska länkar spärrades av Chrome.** 2026-08-08 mötte en av tjänstens
 *    egna inloggningslänkar "Farlig webbplats". Domänen var inte spärrlistad —
 *    det var formen: ny domän, länk via mejl, lång hex-token, mejladress i
 *    klartext och en parameter som pekade vidare till en annan URL.
 * 2. **`/api/auth/signin/email` var en öppen utskicksväg.** Rutten gick att
 *    anropa direkt och skicka ett inloggningsmejl till vilken adress som helst.
 *    Missbruksspärren låg i serverfunktionen på `/login`, inte i Auth.js egen
 *    rutt, så den gick att gå förbi. Det är åtgärdat av att rutten inte finns.
 * 3. **Sessionerna skapades ändå av oss.** Se `auth/session.ts` — Auth.js
 *    lösenordsväg kräver JWT-sessioner, vilket hade brutit löftet om att en
 *    GDPR-radering loggar ut i samma stund.
 *
 * Paketen `next-auth` och `@auth/prisma-adapter` ligger kvar i package.json men
 * importeras inte längre. Att avinstallera dem kräver ett `npm install`, och
 * `node_modules` här är byggt för Windows — se `auth/password.ts` för vad det
 * kostar att röra det trädet från fel operativsystem. `Account` och
 * `VerificationToken` står kvar i schemat av samma skäl: att släppa tabeller
 * är en oåterkallelig migration för att bli av med två tomma tabeller.
 */

/** Formen anroparna redan förväntar sig. */
export interface AppSession {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

async function sessionCookieName(): Promise<string> {
  const headerList = await headers();
  const proto = headerList.get("x-forwarded-proto")?.split(",")[0].trim();
  const secure = proto
    ? proto === "https"
    : process.env.NODE_ENV === "production";

  // Namnet måste vara detsamma som `auth/session.ts` skriver. Går de isär blir
  // användaren utloggad direkt efter inloggning, utan felmeddelande.
  return secure ? "__Secure-authjs.session-token" : "authjs.session-token";
}

/**
 * Null när ingen är inloggad. **Kastar aldrig.** Ett databasfel här hade
 * annars gett en vit sida på varje skyddad sida i tjänsten, och "utloggad" är
 * ett begripligare utfall än ett stackspår.
 */
export async function auth(): Promise<AppSession | null> {
  let sessionToken: string | undefined;

  try {
    const store = await cookies();
    sessionToken = store.get(await sessionCookieName())?.value;
  } catch {
    return null;
  }

  if (!sessionToken) {
    return null;
  }

  try {
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      select: {
        expires: true,
        user: { select: { id: true, email: true, name: true } },
      },
    });

    if (!session) {
      return null;
    }

    // Utgången session behandlas som ingen session. Raden städas inte här: en
    // radering på varje sidvisning vore en skrivning i en läsväg, och utgångna
    // rader gör ingen skada eftersom de aldrig godkänns.
    if (session.expires.getTime() <= Date.now()) {
      return null;
    }

    return { user: session.user };
  } catch (error) {
    console.error("Kunde inte läsa sessionen:", error);
    return null;
  }
}

export async function getRequiredUserId(): Promise<string> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return session.user.id;
}
