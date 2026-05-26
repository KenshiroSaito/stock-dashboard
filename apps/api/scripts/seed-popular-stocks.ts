// Load .env before any other import that may read process.env.
import "dotenv/config";

import { POPULAR_STOCK_SYMBOLS } from "../src/data/popular-stocks.js";
import { getStockMetadata } from "../src/lib/massive.js";
import {
  upsertStockWithMetadata,
  getQuoteWithCache,
} from "../src/services/stocks.js";
import { prisma } from "@stock-dashboard/database";

/**
 * Seed the database with our curated popular stocks.
 *
 * For each symbol:
 *   1. Fetch authoritative metadata from Massive (name, logo, etc.)
 *   2. Upsert into the Stock table (overwriting placeholders)
 *   3. Fetch and persist daily price bars via getQuoteWithCache
 *
 * Throttling: Massive's free tier allows 5 requests/minute. Each symbol
 * costs at most 2 requests (metadata + bars), so we wait ~13 seconds
 * between requests to stay safely under the limit.
 *
 * Idempotent: re-running this script is safe. Metadata is overwritten
 * (so manual fixes will be lost, by design), and price bars are upserted.
 */

// Number of milliseconds to wait between Massive API calls.
// 60_000ms / 5 req = 12_000ms minimum; 13_000ms gives us a safety margin.
const THROTTLE_MS = 13_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seedOne(
  symbol: string,
  index: number,
  total: number,
): Promise<void> {
  console.log(`\n[${index + 1}/${total}] === Seeding ${symbol} ===`);

  // Step 1: metadata
  console.log(`  Fetching metadata...`);
  const metadata = await getStockMetadata(symbol);
  console.log(`    -> ${metadata.name}`);
  await upsertStockWithMetadata(metadata);
  console.log(`    -> upserted into Stock`);

  // Throttle before the next Massive call.
  await sleep(THROTTLE_MS);

  // Step 2: prices. getQuoteWithCache will hit Massive only if cache is stale.
  console.log(`  Fetching/refreshing prices...`);
  const quote = await getQuoteWithCache(symbol);
  console.log(
    `    -> price=${quote.price}  change=${quote.changePercent.toFixed(2)}%`,
  );
}

async function main() {
  const symbols = POPULAR_STOCK_SYMBOLS;
  console.log(
    `Seeding ${symbols.length} popular stocks. ` +
      `Expected duration: ~${Math.ceil((symbols.length * 2 * THROTTLE_MS) / 1000 / 60)} minutes.`,
  );

  const failures: { symbol: string; error: unknown }[] = [];

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    try {
      await seedOne(symbol, i, symbols.length);
    } catch (err) {
      console.error(`  FAILED for ${symbol}:`, err);
      failures.push({ symbol, error: err });
    }

    // Throttle before moving to the next symbol (unless we're at the end).
    if (i < symbols.length - 1) {
      await sleep(THROTTLE_MS);
    }
  }

  console.log("\n=== Summary ===");
  console.log(
    `Seeded successfully: ${symbols.length - failures.length}/${symbols.length}`,
  );
  if (failures.length > 0) {
    console.log(`Failures:`);
    for (const { symbol, error } of failures) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ${symbol}: ${msg}`);
    }
  }
}

main()
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
