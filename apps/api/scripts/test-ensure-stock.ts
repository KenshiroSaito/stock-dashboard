/**
 * Manual sanity check for the `ensureStock` service.
 *
 * Run with:
 *   pnpm --filter @stock-dashboard/api exec tsx scripts/test-ensure-stock.ts
 *
 * Expected behavior:
 *   1. First call for a new symbol -> creates a Stock row, prints its id.
 *   2. Second call for the same symbol -> returns the SAME id (no duplicate).
 *   3. Manually editing the row's name in the DB and calling again
 *      -> the edited name is preserved (update: {} doesn't clobber).
 */
// Load .env before any other import that may read process.env.
import 'dotenv/config'

import { ensureStock } from "../src/services/stocks.js";
import { prisma } from "@stock-dashboard/database";

async function main() {
  const symbol = "TEST";

  console.log(
    `--- Test 1: ensureStock("${symbol}") called for the first time ---`,
  );
  const id1 = await ensureStock(symbol);
  console.log(`Returned id: ${id1}`);

  const row1 = await prisma.stock.findUnique({ where: { symbol } });
  console.log(`Row in DB:`, row1);

  console.log(`\n--- Test 2: ensureStock("${symbol}") called again ---`);
  const id2 = await ensureStock(symbol);
  console.log(`Returned id: ${id2}`);
  console.log(`Same id as before? ${id1 === id2}`);

  console.log(`\n--- Test 3: Simulating a name update from elsewhere ---`);
  await prisma.stock.update({
    where: { symbol },
    data: { name: "Test Company Inc." },
  });
  console.log(`Manually updated name tso "Test Company Inc."`);

  const id3 = await ensureStock(symbol);
  console.log(`Called ensureStock again. Returned id: ${id3}`);

  const row3 = await prisma.stock.findUnique({ where: { symbol } });
  console.log(`Row in DB after upsert:`, row3);
  console.log(
    `Name preserved? ${row3?.name === "Test Company Inc." ? "YES ✅" : "NO ❌"}`,
  );

  console.log(`\n--- Cleanup ---`);
  await prisma.stock.delete({ where: { symbol } });
  console.log(`Deleted test row.`);
}

main()
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
