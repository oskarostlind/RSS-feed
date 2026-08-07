import type { MetadataRoute } from "next";

/**
 * Sökmotorer ska hitta startsidan och integritetspolicyn, inget annat.
 *
 * `/dashboard` och `/api` är inloggningsskyddade och skulle ändå bara ge
 * omdirigeringar i indexet, men `/api/debug` är värre än meningslöst: de
 * endpointerna tar en hemlighet som frågeparameter, och en indexerad URL med
 * `?secret=` i sig är precis den sortens läcka som är svår att ta tillbaka.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard/", "/login"],
    },
  };
}
