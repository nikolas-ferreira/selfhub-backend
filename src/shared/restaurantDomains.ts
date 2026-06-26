import prisma from "./prisma";

const CACHE_TTL_MS = 60_000;

let cache: { domains: Set<string>; expiresAt: number } | null = null;

async function getRegisteredDomains(): Promise<Set<string>> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.domains;
  }

  const restaurants = await prisma.restaurant.findMany({
    where: { domain: { not: null } },
    select: { domain: true },
  });

  const domains = new Set(restaurants.map((r) => r.domain as string));
  cache = { domains, expiresAt: Date.now() + CACHE_TTL_MS };
  return domains;
}

/**
 * Checks whether an `Origin` header value (e.g.
 * `https://cardapio.boteco-do-ze.com.br`) matches a restaurant's registered
 * custom domain (`Restaurant.domain`) — see CORS handling in `server.ts` and
 * docs/digital-menu-feature.md §0. Since every restaurant's digital menu
 * points at this same API deploy, the static `CORS_ORIGIN` env var alone
 * can't enumerate every customer domain; this checks the DB instead, cached
 * for {@link CACHE_TTL_MS} so it isn't queried on every single request.
 */
export async function isAllowedDomainOrigin(origin: string): Promise<boolean> {
  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  const domains = await getRegisteredDomains();
  return domains.has(hostname);
}
