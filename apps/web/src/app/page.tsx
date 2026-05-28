import { fetchPopularStocks } from "../lib/api";
import { StockTable } from "./StockTable";

/**
 * Home page: shows the curated list of popular stocks.
 *
 * This is a Server Component, so the fetch runs on the Next.js server
 * (not in the browser). That means no CORS concerns and the API URL
 * stays server-side for this initial render.
 */
export default async function Home() {
  const items = await fetchPopularStocks();

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Stock Dashboard
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Curated US equities, daily quotes.
          </p>
        </header>

        <StockTable items={items} />
      </div>
    </main>
  );
}
