/**
 * API client for the Hono backend.
 *
 * Each function maps to one endpoint. Centralizing them here means routes
 * and components don't litter the codebase with hard-coded URLs, and the
 * base URL can be switched (dev vs production) in one place.
 */

import { PopularStockItem, Quote, StockProfile } from "../types/stock";

/**
 * Read the API base URL from the environment. We throw at call time rather
 * than at module load so that errors surface during real use, not on import.
 */
function getApiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Add it to apps/web/.env.local",
    );
  }
  return url.replace(/\/$/, ""); // Strip trailing slash for clean concatenation
}

/**
 * GET /api/stocks/popular
 *
 * Returns the curated popular stocks with quotes.
 * Throws on network failure or non-2xx responses.
 */
export async function fetchPopularStocks(): Promise<PopularStockItem[]> {
  const res = await fetch(`${getApiBaseUrl()}/api/stocks/popular`, {
    // Cache: no-store is safe here while we don't have an ETag/Last-Modified
    // story. Next.js would otherwise cache forever in production.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch popular stocks: ${res.status} ${res.statusText}`,
    );
  }

  const data = (await res.json()) as { items: PopularStockItem[] };
  return data.items;
}

/**
 * GET /api/stocks/:symbol
 */
export async function fetchQuote(symbol: string): Promise<Quote> {
  const res = await fetch(
    `${getApiBaseUrl()}/api/stocks/${encodeURIComponent(symbol)}`,
    { cache: "no-store" },
  );

  if (!res.ok) {
    throw new Error(
      `Failed to fetch quote for ${symbol}: ${res.status} ${res.statusText}`,
    );
  }

  return (await res.json()) as Quote;
}

/**
 * GET /api/stocks/:symbol/profile
 */
export async function fetchProfile(symbol: string): Promise<StockProfile> {
  const res = await fetch(
    `${getApiBaseUrl()}/api/stocks/${encodeURIComponent(symbol)}/profile`,
    { cache: "no-store" },
  );

  if (!res.ok) {
    throw new Error(
      `Failed to fetch profile for ${symbol}: ${res.status} ${res.statusText}`,
    );
  }

  return (await res.json()) as StockProfile;
}
