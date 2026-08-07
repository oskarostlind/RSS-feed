import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAppBaseUrl } from "./appUrl.ts";

function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

function requestWith(headers: Record<string, string>, url = "https://intern.local/api/cron/search"): Request {
  return new Request(url, { headers });
}

test("APP_URL vinner över allt annat", () => {
  const result = resolveAppBaseUrl(
    requestWith({ "x-forwarded-host": "fel.vercel.app" }),
    env({
      APP_URL: "https://kundnytt.se",
      VERCEL_PROJECT_PRODUCTION_URL: "ocksa-fel.vercel.app",
    }),
  );

  assert.equal(result, "https://kundnytt.se");
});

test("x-forwarded-host används framför requestens egen värd", () => {
  // Bakom Vercels proxy är `host` den interna värden. En länk dit når ingen.
  const result = resolveAppBaseUrl(
    requestWith({ "x-forwarded-host": "kundnytt.se" }),
    env({}),
  );

  assert.equal(result, "https://kundnytt.se");
});

test("utan request faller vi tillbaka på Vercels produktionsadress", () => {
  const result = resolveAppBaseUrl(
    undefined,
    env({ VERCEL_PROJECT_PRODUCTION_URL: "rss-feed.vercel.app" }),
  );

  assert.equal(result, "https://rss-feed.vercel.app");
});

test("adress utan schema får https", () => {
  assert.equal(
    resolveAppBaseUrl(undefined, env({ APP_URL: "kundnytt.se" })),
    "https://kundnytt.se",
  );
});

test("sökväg och frågesträng skalas bort till origin", () => {
  assert.equal(
    resolveAppBaseUrl(
      undefined,
      env({ APP_URL: "https://kundnytt.se/dashboard?a=1" }),
    ),
    "https://kundnytt.se",
  );
});

test("obrukbar adress ger null i stället för en trasig länk", () => {
  // Samma felmönster som den avklippta AUTH_URL:en i produktionsmiljön.
  assert.equal(resolveAppBaseUrl(undefined, env({ APP_URL: "https://" })), null);
  assert.equal(resolveAppBaseUrl(undefined, env({ APP_URL: "   " })), null);
  assert.equal(resolveAppBaseUrl(undefined, env({})), null);
});
