/**
 * Clean type definitions used across the application.
 *
 * External APIs (e.g. Massive) return raw responses in their own formats.
 * We convert those raw responses into the types defined here before passing
 * them to other layers. This isolates the rest of the app from upstream
 * API changes (Anti-Corruption Layer pattern).
 */

/**
 * One day of OHLCV price data.
 */
export type DailyBar = {
  date: string; // ISO 8601 date (e.g. "2026-05-21")
  open: number; // Opening price
  high: number; // Highest price of the day
  low: number; // Lowest price of the day
  close: number; // Closing price
  volume: number; // Trading volume
};

/**
 * Current quote summary for a single stock.
 */
export type Quote = {
  symbol: string; // Ticker symbol (e.g. "AAPL")
  price: number; // Current price (= latest close)
  previousClose: number; // Previous trading day's close
  change: number; // Absolute change (price - previousClose)
  changePercent: number; // Percentage change as a raw number, no "%" sign (e.g. 0.9065)
  latestTradingDay: string; // Latest trading day, ISO 8601 (e.g. "2026-05-21")
};
