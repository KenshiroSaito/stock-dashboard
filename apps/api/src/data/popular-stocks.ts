/**
 * Curated list of stocks to feature on the dashboard's "popular" view.
 *
 * This list is intentionally static and short. It defines what the user
 * sees on the front page before they search or sign in. We could later
 * make this dynamic (most-viewed, most-traded, etc.) but for an MVP a
 * hand-picked list is fine.
 *
 * Add or remove symbols here, then re-run the seed script:
 *   pnpm --filter @stock-dashboard/api exec tsx scripts/seed-popular-stocks.ts
 */
export const POPULAR_STOCK_SYMBOLS = [
  "AAPL",  // Apple
  "MSFT",  // Microsoft
  "GOOGL", // Alphabet (Google)
  "AMZN",  // Amazon
  "META",  // Meta (Facebook)
  "TSLA",  // Tesla
  "NVDA",  // NVIDIA
  "JPM",   // JPMorgan Chase
  "V",     // Visa
  "WMT",   // Walmart
] as const;

/**
 * Type derived from the constant. Lets callers say `PopularSymbol` instead
 * of `string` and get autocomplete + tighter type checks.
 */
export type PopularSymbol = (typeof POPULAR_STOCK_SYMBOLS)[number];