/**
 * Massive (formerly Polygon.io) API client.
 *
 * This module is the Anti-Corruption Layer for Massive's API:
 * - It is the ONLY place in the codebase that talks to Massive directly.
 * - Raw Massive responses are converted into our clean domain types
 *   (DailyBar, Quote) before being returned.
 * - If we ever switch to another data provider, only this file needs
 *   to be rewritten.
 */

import type { DailyBar, Quote, StockMetadata } from "../types/stock.js";

// ---------- Configuration ----------

const MASSIVE_BASE_URL = "https://api.massive.com";

/**
 * Read the API key from the environment at call time (not at module load),
 * so that tests can override process.env before calling.
 */
function getApiKey(): string {
  const key = process.env.MASSIVE_API_KEY;
  if (!key) {
    throw new Error(
      "MASSIVE_API_KEY is not set. Please add it to apps/api/.env",
    );
  }
  return key;
}

// ---------- Raw response types (mirror what Massive actually returns) ----------

/**
 * Shape of a single bar (one day of OHLCV) in Massive's raw response.
 * Field names are short single letters by Massive's convention.
 */
type MassiveBar = {
  T?: string; // Ticker (sometimes omitted)
  v: number; // Volume
  vw?: number; // Volume-weighted average price
  o: number; // Open
  c: number; // Close
  h: number; // High
  l: number; // Low
  t: number; // Unix millisecond timestamp
  n?: number; // Number of transactions
};

/**
 * Shape of the Aggregates (Bars) endpoint response.
 */
type MassiveAggregatesResponse = {
  ticker: string;
  status: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results?: MassiveBar[];
  request_id: string;
  count?: number;
};

/**
 * Shape of a ticker details record returned by Massive's Reference API.
 * We only declare the fields we actually consume; Massive returns many
 * more (market cap, employee count, etc.) which we ignore for now.
 */
type MassiveTickerDetails = {
  ticker: string;
  name: string;
  primary_exchange?: string;
  description?: string;
  homepage_url?: string;
  branding?: {
    logo_url?: string;
    icon_url?: string;
  };
  active?: boolean;
};

/**
 * Response wrapper for /v3/reference/tickers/{ticker}.
 */
type MassiveTickerDetailsResponse = {
  request_id: string;
  status: string;
  results?: MassiveTickerDetails;
};

// ---------- Low-level fetcher ----------

/**
 * Send a GET request to Massive with the API key in the Authorization header.
 * Throws on non-2xx responses or when the JSON body indicates an error.
 */
async function fetchFromMassive<T>(path: string): Promise<T> {
  const url = `${MASSIVE_BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Massive API request failed: ${response.status} ${response.statusText} - ${text}`,
    );
  }

  const data = (await response.json()) as T;
  return data;
}

// ---------- Converters (raw -> clean domain types) ----------

/**
 * Convert a Unix millisecond timestamp into an ISO 8601 date string (YYYY-MM-DD)
 * in UTC. Using UTC keeps results deterministic regardless of server timezone.
 */
function msToIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Convert a raw Massive bar into our clean DailyBar type.
 */
function toDailyBar(bar: MassiveBar): DailyBar {
  return {
    date: msToIsoDate(bar.t),
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v,
  };
}

/**
 * Convert a raw Massive ticker details payload into our clean StockMetadata.
 */
function toStockMetadata(raw: MassiveTickerDetails): StockMetadata {
  return {
    symbol: raw.ticker,
    name: raw.name,
    exchange: raw.primary_exchange,
    description: raw.description,
    logoUrl: raw.branding?.logo_url,
    iconUrl: raw.branding?.icon_url,
    homepageUrl: raw.homepage_url,
  };
}

// ---------- Public API ----------

/**
 * Fetch daily OHLCV bars for a symbol between `from` and `to` (inclusive).
 * Dates must be in ISO 8601 format (YYYY-MM-DD).
 *
 * Example:
 *   getDailyBars("AAPL", "2026-05-14", "2026-05-21")
 */
export async function getDailyBars(
  symbol: string,
  from: string,
  to: string,
): Promise<DailyBar[]> {
  const path = `/v2/aggs/ticker/${encodeURIComponent(
    symbol,
  )}/range/1/day/${from}/${to}`;

  const data = await fetchFromMassive<MassiveAggregatesResponse>(path);

  // Massive returns no `results` field when the symbol has no data in the range.
  const bars = data.results ?? [];
  return bars.map(toDailyBar);
}

/**
 * Fetch the latest quote for a symbol: current price, previous close,
 * absolute change, and percentage change.
 *
 * Implementation note: Massive's free tier doesn't expose a single "quote"
 * endpoint with change percent, so we derive it from the last two daily bars.
 * We request a 10-day window to safely cover weekends and holidays.
 */
export async function getQuote(symbol: string): Promise<Quote> {
  const today = new Date();
  const tenDaysAgo = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000);

  const from = msToIsoDate(tenDaysAgo.getTime());
  const to = msToIsoDate(today.getTime());

  const bars = await getDailyBars(symbol, from, to);

  if (bars.length < 2) {
    throw new Error(
      `Not enough price data for ${symbol} to compute a quote (got ${bars.length} bars).`,
    );
  }

  const latest = bars[bars.length - 1];
  const previous = bars[bars.length - 2];

  const change = latest.close - previous.close;
  const changePercent = (change / previous.close) * 100;

  return {
    symbol: symbol.toUpperCase(),
    price: latest.close,
    previousClose: previous.close,
    change,
    changePercent,
    latestTradingDay: latest.date,
  };
}

/**
 * Fetch reference metadata (name, logo, description, etc.) for a symbol.
 *
 * Called rarely, since this data is essentially static. Typical usage is:
 * once at seed time, and again only when we encounter a brand-new symbol.
 */
export async function getStockMetadata(symbol: string): Promise<StockMetadata> {
  const path = `/v3/reference/tickers/${encodeURIComponent(symbol.toUpperCase())}`;
  const data = await fetchFromMassive<MassiveTickerDetailsResponse>(path);

  if (!data.results) {
    throw new Error(`No metadata found for symbol "${symbol}".`);
  }

  return toStockMetadata(data.results);
}
