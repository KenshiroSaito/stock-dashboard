/**
 * Stock endpoints — Variant B: validation powered by Zod schemas.
 *
 * Functionally identical to stocks-v1.ts, but uses Zod for input validation.
 * Compare side-by-side to decide which approach to keep.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  getQuoteWithCache,
  getPopularStocks,
  getHistoryWithCache,
  getMetadataWithCache,
} from "../services/stocks.js";
import { errorResponse } from "../lib/errors.js";

// ---------- Schemas ----------

/**
 * Ticker symbol: 1-5 uppercase letters.
 * `.transform(s => s.toUpperCase())` normalizes "aapl" -> "AAPL" before
 * validation runs, so users can submit either case.
 */
const SymbolSchema = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{1,5}$/, "Symbol must be 1-5 letters."));

/**
 * Allowed values for the ?range= query parameter.
 */
const RangeSchema = z.enum(["7d", "30d", "1y"]);

// ---------- Helpers ----------

/**
 * Format the first Zod issue as a human-readable message.
 * Zod can report multiple errors at once; for an API consumer we surface
 * just the first one to keep messages short and actionable.
 */
function formatZodError(error: z.ZodError): string {
  const first = error.issues[0];
  const path = first.path.length > 0 ? first.path.join(".") + ": " : "";
  return path + first.message;
}

// ---------- Routes ----------

const stocks = new Hono();

/**
 * GET /api/stocks/popular
 * Returns the curated popular stocks with quotes, from cache only.
 * Symbols that aren't cached are silently omitted.
 */
stocks.get("/popular", async (c) => {
  try {
    const items = await getPopularStocks();
    return c.json({ items });
  } catch (err) {
    console.error("Fauled to fetch popular stocks: ", err);
    return errorResponse(
      c,
      500,
      "INTERNAL_ERROR",
      "Failed to fetch popular stocks. ",
    );
  }
});

/**
 * GET /api/stocks/:symbol
 */
stocks.get("/:symbol", async (c) => {
  const parsedSymbol = SymbolSchema.safeParse(c.req.param("symbol"));
  if (!parsedSymbol.success) {
    return errorResponse(
      c,
      400,
      "INVALID_PARAMETER",
      formatZodError(parsedSymbol.error),
    );
  }
  const symbol = parsedSymbol.data;

  try {
    const quote = await getQuoteWithCache(symbol);
    return c.json(quote);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Not enough price data")) {
      return errorResponse(
        c,
        404,
        "STOCK_NOT_FOUND",
        `No quote data available for "${symbol}".`,
      );
    }
    console.error("Failed to fetch quote:", err);
    return errorResponse(
      c,
      502,
      "UPSTREAM_ERROR",
      "Failed to fetch quote from upstream provider.",
    );
  }
});

/**
 * GET /api/stocks/:symbol/history?range=7d|30d|1y
 */
stocks.get("/:symbol/history", async (c) => {
  const parsedSymbol = SymbolSchema.safeParse(c.req.param("symbol"));
  if (!parsedSymbol.success) {
    return errorResponse(
      c,
      400,
      "INVALID_PARAMETER",
      formatZodError(parsedSymbol.error),
    );
  }
  const symbol = parsedSymbol.data;

  const parsedRange = RangeSchema.safeParse(c.req.query("range"));
  if (!parsedRange.success) {
    return errorResponse(
      c,
      400,
      "INVALID_PARAMETER",
      formatZodError(parsedRange.error),
    );
  }
  const range = parsedRange.data;

  try {
    const bars = await getHistoryWithCache(symbol, range);

    if (bars.length === 0) {
      return errorResponse(
        c,
        404,
        "STOCK_NOT_FOUND",
        `No price history available for "${symbol}".`,
      );
    }

    return c.json({ symbol, range, bars });
  } catch (err) {
    console.error("Failed to fetch history: ", err);
    return errorResponse(
      c,
      502,
      "UPSTREAM_ERROR",
      "Failed to fetch history from upstream provider.",
    );
  }
});

/**
 * GET /api/stocks/:symbol/profile
 * Company metadata (name, description, logo). DB-cached; falls back to Massive.
 */
stocks.get("/:symbol/profile", async (c) => {
  const parsedSymbol = SymbolSchema.safeParse(c.req.param("symbol"));
  if (!parsedSymbol.success) {
    return errorResponse(
      c,
      400,
      "INVALID_PARAMETER",
      formatZodError(parsedSymbol.error),
    );
  }
  const symbol = parsedSymbol.data;

  try {
    const profile = await getMetadataWithCache(symbol);
    return c.json(profile);
  } catch (err) {
    if (err instanceof Error && err.message.includes("No metadata found")) {
      return errorResponse(
        c,
        404,
        "STOCK_NOT_FOUND",
        `No profile data available for "${symbol}".`,
      );
    }
    console.error("Failed to fetch profile:", err);
    return errorResponse(
      c,
      502,
      "UPSTREAM_ERROR",
      "Failed to fetch profile from upstream provider.",
    );
  }
});

export { stocks as stocksRoutes };
