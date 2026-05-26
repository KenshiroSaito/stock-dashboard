/**
 * Stock endpoints — Variant B: validation powered by Zod schemas.
 *
 * Functionally identical to stocks-v1.ts, but uses Zod for input validation.
 * Compare side-by-side to decide which approach to keep.
 */

import { Hono } from "hono";
import { z } from "zod";
import { getDailyBars } from "../lib/massive.js";
import { getQuoteWithCache } from "../services/stocks.js";
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
 * Using z.enum gives us both runtime validation AND a precise literal type
 * (`"7d" | "30d" | "1y"`) — Zod is the single source of truth for both.
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

  // Convert the range to a date window.
  const daysByRange = { "7d": 7, "30d": 30, "1y": 365 };
  const days = daysByRange[range];

  const today = new Date();
  const start = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  const toIso = (d: Date) => d.toISOString().slice(0, 10);

  try {
    const bars = await getDailyBars(symbol, toIso(start), toIso(today));

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
    console.error("Failed to fetch history:", err);
    return errorResponse(
      c,
      502,
      "UPSTREAM_ERROR",
      "Failed to fetch history from upstream provider.",
    );
  }
});

export { stocks as stocksRoutes };
