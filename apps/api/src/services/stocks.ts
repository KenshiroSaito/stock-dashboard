/**
 * Stock service layer.
 *
 * This layer sits between the HTTP routes (controllers) and the external
 * data sources (Massive API, database). It owns business logic like:
 *  - Caching: prefer the DB, fall back to Massive only when needed
 *  - Persistence: save Massive responses into PriceCache for reuse
 *  - Bookkeeping: ensure a Stock row exists before storing PriceCache rows
 *
 * Routes call into this layer; this layer never returns HTTP responses.
 */

import { prisma } from "@stock-dashboard/database";

/**
 * Ensure a Stock row exists for the given symbol, and return its id.
 *
 * The Stock table requires a `name` field, but at this stage we don't have
 * a cheap way to fetch the official company name without burning a Massive
 * API call. As a temporary measure we use the symbol itself as a placeholder
 * name (e.g. name="AAPL" for symbol="AAPL"). When we later implement the
 * stock detail endpoint, that flow will update the row with the real name.
 *
 * `upsert` is idempotent: if the row already exists, we don't overwrite the
 * existing name (which may have been filled in with the real value by then).
 */
export async function ensureStock(symbol: string): Promise<string> {
  const stock = await prisma.stock.upsert({
    where: { symbol },
    create: {
      symbol,
      name: symbol, // Placeholder; replaced later by the stock-detail flow.
    },
    update: {}, // Intentionally empty: don't clobber data set elsewhere.
  });
  return stock.id;
}
