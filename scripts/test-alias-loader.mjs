import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Löser upp `@/...` när Nodes testkörare kör TypeScript direkt.
 *
 * Utan den kan bara filer utan interna beroenden enhetstestas, vilket i
 * praktiken betyder att den intressanta logiken inte går att testa alls —
 * `buildImportPreview` importerar sin normalisering, som i sin tur importerar
 * `companyQuery`.
 *
 * Alternativet vore att skriva relativa sökvägar i produktionskoden, men då
 * styr testerna hur applikationen ser ut. Femton rader här är billigare.
 */

const projectRoot = path.resolve(import.meta.dirname, "..");

export function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) {
    return nextResolve(specifier, context);
  }

  const target = path.join(projectRoot, "src", specifier.slice(2));

  // Importerna i repot skrivs utan filändelse, men Node kräver en exakt
  // sökväg. `.ts` först eftersom det är vad källkoden är.
  for (const candidate of [
    `${target}.ts`,
    `${target}.tsx`,
    `${target}.js`,
    path.join(target, "index.ts"),
  ]) {
    if (existsSync(candidate)) {
      return nextResolve(pathToFileURL(candidate).href, context);
    }
  }

  return nextResolve(specifier, context);
}
