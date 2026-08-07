import { inflateRawSync } from "node:zlib";

/**
 * Minimal ZIP-läsare, precis så mycket som en `.xlsx` kräver.
 *
 * Varför inte ett bibliotek: `node_modules` i det här repot är byggt för
 * Windows, och att köra `npm install` från en Linux-miljö skriver in
 * inkompatibla binärer i samma träd. Risken att sänka den lokala utvecklingen
 * väger tyngre än de åttio raderna här. En `.xlsx` är dessutom alltid skriven
 * av Excel eller ett exportbibliotek, inte av en angripare med tur — vi
 * behöver inte hantera hela formatet, bara det Excel faktiskt skriver.
 *
 * Läser den centrala katalogen bakifrån, som specifikationen föreskriver.
 * Filnamnen ligger inte i någon förutsägbar ordning i den lokala headern, och
 * att söka efter dem framifrån är hur felaktiga zip-läsare byggs.
 */

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;

const STORED = 0;
const DEFLATED = 8;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

interface CentralEntry {
  fileName: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  // Kommentarfältet är max 65535 byte, så längre bak än så behöver vi inte gå.
  const minimum = Math.max(0, buffer.length - 65_535 - 22);

  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }

  throw new ZipError("Filen är inte ett giltigt zip-arkiv (.xlsx).");
}

function readCentralDirectory(buffer: Buffer): CentralEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  const entries: CentralEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_FILE_HEADER) {
      break;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);

    entries.push({
      fileName: buffer
        .subarray(offset + 46, offset + 46 + fileNameLength)
        .toString("utf8"),
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function readEntry(buffer: Buffer, entry: CentralEntry): Buffer {
  const local = entry.localHeaderOffset;

  // Den lokala headern har egna längder för namn och extrafält, och de skiljer
  // sig ofta från den centrala katalogens. Att återanvända den centrala
  // längden är det klassiska felet — det ger data som börjar några byte fel.
  const fileNameLength = buffer.readUInt16LE(local + 26);
  const extraLength = buffer.readUInt16LE(local + 28);
  const dataStart = local + 30 + fileNameLength + extraLength;
  const data = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === STORED) {
    return Buffer.from(data);
  }

  if (entry.compressionMethod === DEFLATED) {
    return inflateRawSync(data);
  }

  throw new ZipError(
    `Komprimeringsmetod ${entry.compressionMethod} stöds inte.`,
  );
}

/** Packar upp arkivet till en karta från filnamn till innehåll. */
export function unzip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();

  for (const entry of readCentralDirectory(buffer)) {
    // Kataloger har noll storlek och namn som slutar med snedstreck.
    if (entry.fileName.endsWith("/")) {
      continue;
    }

    files.set(entry.fileName, readEntry(buffer, entry));
  }

  return files;
}
