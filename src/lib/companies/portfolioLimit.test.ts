import assert from "node:assert/strict";
import test from "node:test";
import { describePortfolioLimit } from "@/lib/companies/portfolioCapacity";

test("den som fyllt budgeten själv får ett råd hen kan följa", () => {
  const text = describePortfolioLimit({
    limit: 110,
    used: 110,
    usedByOthers: 0,
    remaining: 0,
  });

  assert.match(text, /Ta bort några bevakningar/);
});

test("är budgeten fylld av andra föreslås inte något användaren inte rår över", () => {
  // Det viktiga är vad texten *inte* säger. Att be någon ta bort sina egna
  // bevakningar när det är andra konton som fyllt körningen är ett råd som
  // inte hjälper, och användaren upptäcker det först efter att ha följt det.
  const text = describePortfolioLimit({
    limit: 110,
    used: 5,
    usedByOthers: 105,
    remaining: 0,
  });

  assert.doesNotMatch(text, /Ta bort/);
  assert.match(text, /full/);
});

test("texten räknar med hela belastningen, inte bara användarens egen", () => {
  const text = describePortfolioLimit({
    limit: 110,
    used: 5,
    usedByOthers: 105,
    remaining: 0,
  });

  assert.match(text, /110 bolag totalt och 110 bevakas redan/);
});
