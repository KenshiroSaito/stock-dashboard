// Load .env before any other import that may read process.env.
import "dotenv/config";

import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { POPULAR_STOCK_SYMBOLS } from "../src/data/popular-stocks.js";
import { getStockMetadata, fetchLogo } from "../src/lib/massive.js";
import {
  upsertStockWithMetadata,
  getQuoteWithCache,
} from "../src/services/stocks.js";
import { prisma } from "@stock-dashboard/database";
import type { StockMetadata } from "../src/types/stock.js";

/**
 * Seed the database with our curated popular stocks.
 *
 * For each symbol:
 *   1. Fetch authoritative metadata from Massive
 *   2. Download the logo SVG (if present) and save it to apps/web/public/logos/
 *   3. Overwrite metadata.logoUrl with the local path before persisting
 *   4. Upsert into Stock
 *   5. Refresh price bars via getQuoteWithCache
 *
 * Logos are saved as static assets because Massive's branding endpoint
 * requires authentication; the browser can't fetch them directly.
 *
 * Throttling: Each symbol costs up to 3 Massive requests (metadata, logo,
 * bars). With a 13s gap between calls, the full 10-symbol run takes ~7 min.
 * Re-runs are dramatically faster because cached prices skip the bars call.
 */

const THROTTLE_MS = 13_000;

/**
 * Where the Next.js app serves static files from.
 * Resolved relative to this script's location to stay stable when run from
 * different working directories.
 */
const LOGOS_DIR = resolve(
  import.meta.dirname,
  "..",
  "..",
  "web",
  "public",
  "logos",
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Download a logo and save it under apps/web/public/logos/{symbol}{ext}.
 * Returns the public-facing path (e.g. "/logos/AAPL.svg") to store in DB,
 * or null if there's no logo to download.
 */
async function downloadAndSaveLogo(
  symbol: string,
  metadata: StockMetadata,
): Promise<string | null> {
  if (!metadata.logoUrl) {
    return null;
  }

  // Derive extension from the URL; default to .svg since most are SVG.
  const urlExtMatch = metadata.logoUrl.match(/\.(svg|png|jpe?g)(?:\?|$)/i);
  const ext = urlExtMatch ? `.${urlExtMatch[1].toLowerCase()}` : ".svg";

  const filename = `${symbol}${ext}`;
  const filepath = join(LOGOS_DIR, filename);
  const publicPath = `/logos/${filename}`;

  const data = await fetchLogo(metadata.logoUrl);
  await writeFile(filepath, data);

  return publicPath;
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

  // Step 2: logo (if any). This counts as another Massive call, so wait first.
  await sleep(THROTTLE_MS);

  console.log(`  Downloading logo...`);
  const localLogoPath = await downloadAndSaveLogo(symbol, metadata);
  if (localLogoPath) {
    console.log(`    -> saved to ${localLogoPath}`);
  } else {
    console.log(`    -> no logo URL, skipping`);
  }

  // Step 3: upsert with the LOCAL logo path, not the upstream URL.
  await upsertStockWithMetadata({
    ...metadata,
    logoUrl: localLogoPath ?? undefined,
  });
  console.log(`    -> upserted into Stock`);

  // Step 4: prices. getQuoteWithCache hits Massive only on cache miss.
  await sleep(THROTTLE_MS);

  console.log(`  Fetching/refreshing prices...`);
  const quote = await getQuoteWithCache(symbol);
  console.log(
    `    -> price=${quote.price}  change=${quote.changePercent.toFixed(2)}%`,
  );
}

async function main() {
  // Ensure the destination directory exists before any write.
  await mkdir(LOGOS_DIR, { recursive: true });
  console.log(`Logos will be written to: ${LOGOS_DIR}`);

  const symbols = POPULAR_STOCK_SYMBOLS;
  const estimatedMinutes = Math.ceil(
    (symbols.length * 3 * THROTTLE_MS) / 1000 / 60,
  );
  console.log(
    `Seeding ${symbols.length} popular stocks. Expected duration: ~${estimatedMinutes} minutes.`,
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
