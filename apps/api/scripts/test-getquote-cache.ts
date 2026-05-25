/**
 * Manual sanity check for getQuoteWithCache.
 *
 * Run with:
 *   pnpm --filter @stock-dashboard/api exec tsx scripts/test-getquote-cache.ts
 *
 * Expected behavior:
 *   1. First call -> CACHE MISS, fetches from Massive, persists, returns quote.
 *   2. Second call (immediately after) -> CACHE HIT, returns from DB.
 *   3. PriceCache rows are visible in the DB afterwards.
 */

// Load .env before any other import that may read process.env.
import 'dotenv/config'

import { getQuoteWithCache } from "../src/services/stocks.js";
import { prisma } from "@stock-dashboard/database";

async function main() {
  const symbol = "AAPL";

  console.log("--- Test 1: First call (expecting CACHE MISS) ---");
  const quote1 = await getQuoteWithCache(symbol);
  console.log("Quote:", quote1);

  console.log("\n--- Test 2: Second call (expecting CACHE HIT) ---");
  const quote2 = await getQuoteWithCache(symbol);
  console.log("Quote:", quote2);

  console.log("\n--- DB inspection: PriceCache rows for AAPL ---");
  const stock = await prisma.stock.findUnique({ where: { symbol } });
  if (stock) {
    const rows = await prisma.priceCache.findMany({
      where: { stockId: stock.id },
      orderBy: { date: "asc" },
    });
    console.log(`Found ${rows.length} cached rows:`);
    for (const row of rows) {
      console.log(
        `  ${row.date.toISOString().slice(0, 10)}  close=${row.close.toString()}  volume=${row.volume.toString()}`,
      );
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
