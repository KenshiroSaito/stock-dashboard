/**
 * Stock-related types for the front-end.
 *
 * These mirror the API's response shapes. They're intentionally redefined
 * here (rather than imported from the backend) so the front-end can be
 * deployed independently. If they ever drift from the backend, a runtime
 * error will catch it during development.
 *
 * Future improvement: generate these from a single source of truth
 * (OpenAPI schema, Zod schemas, etc.) once the API stabilizes.
 */

/**
 * One row in the popular stocks list, as returned by GET /api/stocks/popular.
 */
export type PopularStockItem = {
  symbol: string;
  name: string;
  exchange?: string;
  logoUrl?: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  latestTradingDay: string;
};

/**
 * A price quote, as returned by GET /api/stocks/:symbol.
 */
export type Quote = {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  latestTradingDay: string;
};

/**
 * Company metadata, as returned by GET /api/stocks/:symbol/profile.
 */
export type StockProfile = {
  symbol: string;
  name: string;
  exchange?: string;
  description?: string;
  logoUrl?: string;
  iconUrl?: string;
  homepageUrl?: string;
};
