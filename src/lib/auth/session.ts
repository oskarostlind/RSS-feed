import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Sessioner för lösenordsinloggning.
 *
 * **Varför vi skapar sessionen själva i stället för att låta Auth.js göra det.**
 * Auth.js standardväg för lösenord är `Credentials`-leverantören, och den
 * kräver `strategy: "jwt"` — sessionen blir en signerad kaka utan motsvarighet
 * i databasen. Det hade brutit ett löfte tjänsten redan gett: raderingen i
 * `lib/account/actions.ts` förlitar sig på att kaskaden tar bort `Session`, så
 * att ett raderat konto loggas ut i samma stund (GDPR artikel 17, se PROJECT.md
 * avsnitt 3). Med JWT lever kakan vidare tills den går ut, och användaren kan
 * fortsätta använda ett konto som inte längre finns.
 *
 * Vi skriver därför en `Session`-rad och sätter **exakt den kaka Auth.js
 * läser**. Följden är att `auth()`, `getRequiredUserId()` och
 * dashboard-layouten fungerar oförändrade — de vet inte om att inloggningen
 * bytts ut. Det är hela poängen: den mest spridda koden i appen behöver inte
 * röras.
 *
 * Namnet och prefixet är hämtade ur `@auth/core/lib/utils/cookie.js`, där
 * `useSecureCookies` avgörs av om adressen är https. Går de isär hittar Auth.js
 * ingen session och användaren blir utloggad direkt efter inloggning — därför
 * härleds det ur requesten och inte ur `NODE_ENV`.
 */

/** Samma som Auth.js standard: 30 dagar. */
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** 32 byte hex. Auth.js egna sessionstokens är av samma storleksordning. */
const TOKEN_BYTES = 32;

async function isSecureRequest(): Promise<boolean> {
  const headerList = await headers();
  const proto = headerList.get("x-forwarded-proto");

  if (proto) {
    return proto.split(",")[0].trim() === "https";
  }

  // Utan proxy-huvud är vi i praktiken på localhost under utveckling.
  return process.env.NODE_ENV === "production";
}

async function sessionCookieName(): Promise<string> {
  return (await isSecureRequest())
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

/**
 * Loggar in användaren genom att skapa en session och sätta kakan.
 *
 * Anropas först efter att lösenordet kontrollerats — funktionen gör ingen
 * behörighetskontroll själv, och ska aldrig anropas med ett id som kommer från
 * användaren.
 */
export async function createUserSession(userId: string): Promise<void> {
  const sessionToken = randomBytes(TOKEN_BYTES).toString("hex");
  const expires = new Date(Date.now() + SESSION_MAX_AGE_MS);

  await prisma.session.create({ data: { sessionToken, userId, expires } });

  const secure = await isSecureRequest();
  const store = await cookies();

  store.set((await sessionCookieName()), sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    expires,
  });
}

/**
 * Loggar ut från *den här* webbläsaren: raderar sessionsraden och kakan.
 *
 * Raden tas bort och inte bara kakan. En kvarlämnad rad hade fortsatt fungera
 * för den som kopierat kakan, vilket är precis det utloggning ska förhindra.
 */
export async function destroyUserSession(): Promise<void> {
  const name = await sessionCookieName();
  const store = await cookies();
  const sessionToken = store.get(name)?.value;

  if (sessionToken) {
    try {
      await prisma.session.delete({ where: { sessionToken } });
    } catch {
      // Raden kan redan vara borta — utgången, raderad med kontot, eller
      // utloggad i en annan flik. Kakan ska bort ändå.
    }
  }

  store.delete(name);
}

/**
 * Loggar ut användaren **överallt** genom att ta bort alla sessionsrader.
 *
 * Används vid lösenordsbyte och återställning. Det är hela poängen med att ha
 * sessionerna i databasen: den som just ändrat sitt lösenord för att någon
 * annan kommit åt kontot ska kasta ut inkräktaren, inte bara sig själv.
 */
export async function destroyAllUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
