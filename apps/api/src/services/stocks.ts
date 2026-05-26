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
import { getDailyBars as fetchBarsFromMassive } from "../lib/massive.js";
import type { DailyBar, Quote } from "../types/stock.js";
import type { PriceCache } from "@stock-dashboard/database";

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

/**
 * How many days old the most recent cached bar may be before we consider
 * the cache "stale" and refetch from Massive.
 *
 * Set to 4 to absorb a typical Friday->Monday weekend (3 calendar days)
 * plus one extra day of slack for holidays. A more rigorous solution
 * would compute the last US market day; that's left as a future
 * enhancement (Phase 2+).
 */
const FRESHNESS_DAYS = 7;

/**
 * How many calendar days of history to request from Massive on a cache miss.
 * Wider than necessary so weekends and holidays don't leave us with < 2 bars.
 */
const FETCH_WINDOW_DAYS = 10;

// ---------- Type converters ----------

/**
 * Convert a PriceCache row from Prisma into our clean DailyBar type.
 * Prisma returns Decimal and BigInt instances which can't be serialized
 * directly; we convert them to plain numbers here.
 *
 * Precision note: Decimal -> number can lose precision beyond ~15 digits.
 * For stock prices and volumes in our range this is fine, but for a real
 * trading system you'd keep them as strings end-to-end.
 */
function rowToDailyBar(row: PriceCache): DailyBar {
  return {
    date: row.date.toISOString().slice(0, 10),
    open: row.open.toNumber(),
    high: row.high.toNumber(),
    low: row.low.toNumber(),
    close: row.close.toNumber(),
    volume: Number(row.volume),
  };
}

// ---------- Freshness check ----------

/**
 * The cache is "fresh enough" to satisfy a quote request when:
 *   - We have at least 2 bars (needed to compute change percent)
 *   - The latest bar's date is within FRESHNESS_DAYS of today
 *
 * Using UTC for the date math keeps this deterministic across timezones.
 */
function isCacheFresh(latestBarDate: Date): boolean {
  const now = Date.now();
  const ageMs = now - latestBarDate.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  
  return ageDays <= FRESHNESS_DAYS;
}

// ---------- Persistence ----------

/**
 * Save a batch of DailyBars to PriceCache for the given stock.
 * Uses upsert so re-fetching the same date is idempotent.
 *
 * We run upserts in parallel with Promise.all. For very large batches you'd
 * want to throttle this, but a 10-day window stays well under that threshold.
 */
async function saveBars(stockId: string, bars: DailyBar[]): Promise<void> {
  await Promise.all(
    bars.map((bar) =>
      prisma.priceCache.upsert({
        where: {
          stockId_date: { stockId, date: new Date(bar.date) },
        },
        create: {
          stockId,
          date: new Date(bar.date),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: BigInt(Math.round(bar.volume)),
        },
        update: {
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: BigInt(Math.round(bar.volume)),
        },
      }),
    ),
  );
}

// ---------- Quote computation ----------

/**
 * Build a Quote from the two most recent bars.
 * Caller must guarantee bars.length >= 2 and the array is sorted ascending.
 */
function computeQuote(symbol: string, bars: DailyBar[]): Quote {
  const latest = bars[bars.length - 1];
  const previous = bars[bars.length - 2];
  const change = latest.close - previous.close;
  const changePercent = (change / previous.close) * 100;
  return {
    symbol,
    price: latest.close,
    previousClose: previous.close,
    change,
    changePercent,
    latestTradingDay: latest.date,
  };
}

// ---------- Public API ----------

/**
 * Get the latest Quote for a symbol, preferring cached data when fresh.
 *
 * Flow:
 *   1. Ensure a Stock row exists for the symbol.
 *   2. Read up to 2 most-recent PriceCache rows.
 *   3. If we have 2+ rows and the latest is recent -> CACHE HIT.
 *   4. Otherwise -> CACHE MISS: fetch from Massive, persist, recompute.
 */
export async function getQuoteWithCache(symbol: string): Promise<Quote> {
  const normalized = symbol.toUpperCase();
  const stockId = await ensureStock(normalized);

  // Step 2: try the cache.
  const cachedRows = await prisma.priceCache.findMany({
    where: { stockId },
    orderBy: { date: "desc" },
    take: 2,
  });

  if (cachedRows.length >= 2 && isCacheFresh(cachedRows[0].date)) {
    console.log(`[stocks] CACHE HIT for ${normalized}`);
    // findMany returned newest-first; computeQuote expects oldest-first.
    const bars = cachedRows.map(rowToDailyBar).reverse();
    return computeQuote(normalized, bars);
  }

  console.log(
    `[stocks] CACHE MISS for ${normalized}, fetching from Massive...`,
  );

  // Step 4: fetch a window from Massive.
  const today = new Date();
  const start = new Date(
    today.getTime() - FETCH_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  const bars = await fetchBarsFromMassive(
    normalized,
    toIso(start),
    toIso(today),
  );

  if (bars.length < 2) {
    throw new Error(
      `Not enough price data for ${normalized} to compute a quote (got ${bars.length} bars).`,
    );
  }

  // Persist and return. We don't await persistence-then-return separately;
  // we want the write to be done before the function resolves, so callers
  // can rely on follow-up reads seeing the fresh data.
  await saveBars(stockId, bars);
  return computeQuote(normalized, bars);
}
