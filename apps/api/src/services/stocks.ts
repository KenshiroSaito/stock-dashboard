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
import type {
  DailyBar,
  HistoryRange,
  Quote,
  StockMetadata,
} from "../types/stock.js";
import type { PriceCache } from "@stock-dashboard/database";
import { POPULAR_STOCK_SYMBOLS } from "../data/popular-stocks.js";
import type { PopularStockItem } from "../types/stock.js";

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
 * Upsert a Stock row with full metadata.
 *
 * Differs from `ensureStock` in that this DOES overwrite existing fields.
 * Used by the seed script and any future "stock detail" flow that fetches
 * authoritative metadata from the upstream provider.
 *
 * Returns the upserted stock's id.
 */
export async function upsertStockWithMetadata(
  metadata: StockMetadata,
): Promise<string> {
  const data = {
    symbol: metadata.symbol,
    name: metadata.name,
    exchange: metadata.exchange ?? null,
    description: metadata.description ?? null,
    logoUrl: metadata.logoUrl ?? null,
    iconUrl: metadata.iconUrl ?? null,
    homepageUrl: metadata.homepageUrl ?? null,
  };

  const stock = await prisma.stock.upsert({
    where: { symbol: metadata.symbol },
    create: data,
    update: data,
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

/**
 * Get a Quote purely from the cache. Does NOT call Massive.
 *
 * Returns null only when the cache can't produce a quote at all — i.e. fewer
 * than 2 bars exist (we need 2 to compute a change percent). Staleness is NOT
 * checked: an old-but-valid quote is returned as-is. Callers that care about
 * freshness should surface `latestTradingDay` to the user.
 *
 * Used by endpoints that prefer "fast and possibly incomplete/stale" over
 * "complete but possibly slow / rate-limited" — for example, the popular
 * stocks list.
 */
export async function getQuoteFromCache(symbol: string): Promise<Quote | null> {
  const normalized = symbol.toUpperCase();

  const stock = await prisma.stock.findUnique({
    where: { symbol: normalized },
    select: { id: true },
  });
  if (!stock) {
    return null;
  }

  const cachedRows = await prisma.priceCache.findMany({
    where: { stockId: stock.id },
    orderBy: { date: "desc" },
    take: 2,
  });

  if (cachedRows.length < 2) {
    return null;
  }

  const bars = cachedRows.map(rowToDailyBar).reverse();
  return computeQuote(normalized, bars);
}

// ---------- History ----------

/**
 * Convert a range alias ("7d" | "30d" | "1y") into a date window.
 */
function rangeToWindow(range: HistoryRange): { from: Date; to: Date } {
  const daysByRange = { "7d": 7, "30d": 30, "1y": 365 };
  const days = daysByRange[range];
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}

/**
 * Get daily price history for a symbol over a range, using cache when fresh.
 *
 * Strategy mirrors getQuoteWithCache, but for a window rather than 2 bars:
 *   1. ensureStock for the symbol
 *   2. Read PriceCache rows inside [from, to]
 *   3. If we have at least one row AND the latest one is fresh -> CACHE HIT
 *   4. Otherwise -> CACHE MISS: fetch the window from Massive, persist, return
 *
 * Note: this does NOT try to patch partial gaps in the cache. If anything is
 * stale or the cache has 0 rows, we refetch the whole window. A smarter
 * "fetch only the missing days" implementation is deferred until we see
 * the simpler version cause real problems.
 */
export async function getHistoryWithCache(
  symbol: string,
  range: HistoryRange,
): Promise<DailyBar[]> {
  const normalized = symbol.toUpperCase();
  const stockId = await ensureStock(normalized);
  const { from, to } = rangeToWindow(range);

  // Read whatever we have in the requested window.
  const cachedRows = await prisma.priceCache.findMany({
    where: {
      stockId,
      date: { gte: from, lte: to },
    },
    orderBy: { date: "asc" },
  });

  if (cachedRows.length > 0) {
    const latestCachedDate = cachedRows[cachedRows.length - 1].date;
    if (isCacheFresh(latestCachedDate)) {
      console.log(
        `[stocks] CACHE HIT for ${normalized} history (${range}, ${cachedRows.length} bars)`,
      );
      return cachedRows.map(rowToDailyBar);
    }
  }

  console.log(
    `[stocks] CACHE MISS for ${normalized} history (${range}), fetching from Massive...`,
  );

  // Fetch the window from Massive and persist.
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  const bars = await fetchBarsFromMassive(normalized, toIso(from), toIso(to));

  if (bars.length > 0) {
    await saveBars(stockId, bars);
  }

  return bars;
}

/**
 * Build the popular stocks list using ONLY cached data.
 *
 * Symbols whose metadata or quote isn't currently cached are silently
 * skipped. The caller (and the front-end) should treat the result as
 * "best effort" — the list may be shorter than POPULAR_STOCK_SYMBOLS.
 *
 * Run the seed-popular-stocks script to populate or refresh the cache.
 */
export async function getPopularStocks(): Promise<PopularStockItem[]> {
  // Fetch all stock metadata in a single query.
  const stocks = await prisma.stock.findMany({
    where: { symbol: { in: [...POPULAR_STOCK_SYMBOLS] } },
    select: {
      symbol: true,
      name: true,
      exchange: true,
      logoUrl: true,
    },
  });

  // Quotes are fetched per-symbol because each requires its own price
  // cache lookup. We run them in parallel since this is pure DB reads.
  const quotesBySymbol = new Map<string, Quote>();
  await Promise.all(
    stocks.map(async (stock) => {
      const quote = await getQuoteFromCache(stock.symbol);
      if (quote) {
        quotesBySymbol.set(stock.symbol, quote);
      }
    }),
  );

  // Build the result in the order defined by POPULAR_STOCK_SYMBOLS,
  // skipping symbols without a quote.
  const items: PopularStockItem[] = [];
  for (const symbol of POPULAR_STOCK_SYMBOLS) {
    const stock = stocks.find((s) => s.symbol === symbol);
    const quote = quotesBySymbol.get(symbol);
    if (!stock || !quote) continue;

    items.push({
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange ?? undefined,
      logoUrl: stock.logoUrl ?? undefined,
      price: quote.price,
      previousClose: quote.previousClose,
      change: quote.change,
      changePercent: quote.changePercent,
      latestTradingDay: quote.latestTradingDay,
    });
  }

  return items;
}
