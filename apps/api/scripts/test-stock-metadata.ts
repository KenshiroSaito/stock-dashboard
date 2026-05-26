// Load .env before any other import that may read process.env.
import "dotenv/config";

import { getStockMetadata } from "../src/lib/massive.js";

async function main() {
  const symbols = ["AAPL", "MSFT", "TSLA"];

  for (const symbol of symbols) {
    console.log(`--- Fetching metadata for ${symbol} ---`);
    try {
      const meta = await getStockMetadata(symbol);
      console.log(meta);
    } catch (err) {
      console.error(`Failed for ${symbol}:`, err);
    }
    // Throttle to stay under 5 req/min.
    await new Promise((resolve) => setTimeout(resolve, 13000));
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
