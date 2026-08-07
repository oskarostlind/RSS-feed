/**
 * Kapacitetsbeskedet, skilt från databasfrågan som räknar fram det.
 *
 * Uppdelningen är gjord för att texten ska gå att testa. `portfolioLimit.ts`
 * importerar Prisma-klienten, och en modul som gör det går inte att ladda i en
 * testkörning utan databas — så länge formuleringen låg där gick den inte att
 * verifiera alls. Formuleringen är dessutom det enda användaren möter när hen
 * slår i taket, alltså precis den del som förtjänar ett test.
 */

export interface PortfolioCapacity {
  /** Vad körningen hinner med totalt, för alla användare tillsammans. */
  limit: number;
  /** Användarens egna bolag. */
  used: number;
  /** Andras bolag, som tar av samma budget. */
  usedByOthers: number;
  /** Vad användaren faktiskt kan lägga till nu. */
  remaining: number;
}

/**
 * Formulerad som en mening en användare kan agera på, inte som ett felnummer.
 * Den som slår i taket har oftast just laddat upp en fil och behöver veta vad
 * som gick fel och vad som går att göra åt det.
 *
 * Två texter, eftersom orsakerna kräver olika handling: har du själv fyllt
 * budgeten kan du ta bort bevakningar, men är den fylld av andra konton finns
 * inget du kan göra — och då är det oärligt att föreslå det, eftersom
 * användaren upptäcker det först efter att ha följt rådet.
 */
export function describePortfolioLimit(capacity: PortfolioCapacity): string {
  const total = capacity.used + capacity.usedByOthers;

  if (capacity.usedByOthers > capacity.used) {
    return (
      `Morgonkörningen hinner med ${capacity.limit} bolag totalt och ` +
      `${total} bevakas redan. Tjänsten är full — hör av dig så höjer vi ` +
      `kapaciteten.`
    );
  }

  return (
    `Morgonkörningen hinner med ${capacity.limit} bolag och du bevakar redan ` +
    `${capacity.used}. Ta bort några bevakningar, eller höj ` +
    `DISCOVERY_CONCURRENCY så att körningen hinner med fler.`
  );
}
