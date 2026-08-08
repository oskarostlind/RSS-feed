import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

/**
 * Hashning och kontroll av lösenord.
 *
 * **Varför scrypt och inte bcrypt eller argon2.** De två senare är bättre
 * kända, men båda är native-moduler — kompilerad kod som måste matcha
 * operativsystemet. `node_modules` i det här repot är byggt på Windows, och ett
 * `npm install` från en Linux-miljö skriver in inkompatibla binärer i samma
 * träd. Det är samma fälla som gör att `prisma db seed` inte går att köra här,
 * och den kostade en kväll en gång redan. `scrypt` ligger i Nodes egen
 * `crypto` och har inget binärberoende alls.
 *
 * scrypt är dessutom inte ett andrahandsval i sak: det är minneshårt, vilket är
 * just den egenskap som gör lösenordshashning dyr att knäcka med grafikkort.
 *
 * **Parametrarna lagras i hashen.** Formatet är
 * `scrypt$N$r$p$salt$hash`, allt base64url. Det betyder att kostnaden går att
 * skruva upp senare utan att befintliga lösenord slutar fungera — gamla hashar
 * kontrolleras med sina egna parametrar. Utan det hade en höjning krävt att
 * varje användare återställde sitt lösenord.
 */

/**
 * `promisify` väljer den överlagring av `scrypt` som saknar options-argumentet,
 * så typen skrivs ut för hand. Utan det går parametrarna inte att skicka med —
 * och just parametrarna är hela poängen med den här modulen.
 */
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * N=16384 är medvetet valt strax under Nodes standardtak för minne (32 MB).
 * `16384 * 8 * 128` blir 16 MB, alltså inom taket utan att behöva höja det.
 * Att i stället välja 32768 och skruva upp `maxmem` hade gjort funktionen
 * beroende av en inställning som är lätt att glömma vid en flytt.
 */
const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Tillräckligt med minne för de valda parametrarna, med marginal. */
const MAX_MEM = 64 * 1024 * 1024;

/**
 * Åtta tecken är ett lågt men medvetet golv.
 *
 * Längdkrav är det enda kravet som bevisat hjälper; krav på specialtecken
 * driver fram `Sommar2026!` och en lapp på skärmen. Vill vi höja ribban är
 * vägen en spärrlista mot de vanligaste lösenorden, inte fler teckenklasser.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Ett tak finns därför att scrypt arbetar på hela indata. Utan det kan vem som
 * helst skicka en megabyte lösenord och få servern att räkna tills den dör —
 * en tjänstevägran som kostar angriparen ett enda anrop.
 */
export const MAX_PASSWORD_LENGTH = 200;

export type PasswordProblem = "kort" | "langt" | "tomt";

/**
 * Null när lösenordet duger. Annars vad som är fel, så att anroparen kan
 * formulera ett besked på svenska utan att känna till reglerna.
 */
export function checkPasswordStrength(
  password: unknown,
): PasswordProblem | null {
  if (typeof password !== "string" || password.length === 0) {
    return "tomt";
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return "kort";
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return "langt";
  }

  return null;
}

function encode(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });

  return ["scrypt", N, R, P, encode(salt), encode(derived)].join("$");
}

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return null;
  }

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const parsedN = Number(rawN);
  const parsedR = Number(rawR);
  const parsedP = Number(rawP);

  if (
    !Number.isInteger(parsedN) ||
    !Number.isInteger(parsedR) ||
    !Number.isInteger(parsedP) ||
    parsedN <= 0 ||
    parsedR <= 0 ||
    parsedP <= 0
  ) {
    return null;
  }

  const salt = Buffer.from(rawSalt, "base64url");
  const hash = Buffer.from(rawHash, "base64url");

  // Tomt salt eller tomt digest avvisas här och inte hos anroparna. Ett test
  // avslöjade att `needsRehash` annars svarade "nej" på `scrypt$16384$8$1$s$`
  // — en rad som ser välformad ut men inte innehåller något att jämföra mot.
  // Den hade alltså blivit liggande i databasen för alltid, samtidigt som
  // varje inloggning mot den misslyckades.
  if (salt.length === 0 || hash.length === 0) {
    return null;
  }

  return { N: parsedN, r: parsedR, p: parsedP, salt, hash };
}

/**
 * Falskt vid fel lösenord **och** vid en trasig eller okänd hash.
 *
 * Att inte kasta är avsiktligt: ett kast här hade blivit ett 500 vid
 * inloggningen, och skillnaden mellan "fel lösenord" och "hashen i databasen är
 * skadad" är inget en inloggningssida ska avslöja. Felet ska loggas av
 * anroparen, inte visas.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = parseHash(stored);

  if (!parsed) {
    return false;
  }

  // Längden tas från den lagrade hashen och inte från konstanten, så att en
  // framtida ändring av KEY_LENGTH inte gör gamla lösenord ogiltiga.
  const derived = await scryptAsync(password, parsed.salt, parsed.hash.length, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
    maxmem: MAX_MEM,
  });

  return timingSafeEqual(derived, parsed.hash);
}

/**
 * Sant när hashen är gjord med svagare parametrar än dagens.
 *
 * Anroparen kan då hasha om lösenordet vid en lyckad inloggning, vilket är den
 * enda stunden vi har lösenordet i klartext. Utan det blir en höjd kostnad bara
 * en ambition — gamla konton behåller sina gamla parametrar för alltid.
 */
export function needsRehash(stored: string): boolean {
  const parsed = parseHash(stored);

  if (!parsed) {
    return true;
  }

  return parsed.N < N || parsed.r < R || parsed.p < P;
}
