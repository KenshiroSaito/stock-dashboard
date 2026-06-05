import Image from "next/image";
import Link from "next/link";
import { PriceChart } from "./PriceChart";
import { fetchQuote, fetchProfile } from "../../../lib/api";

/**
 * Stock detail page at /stocks/[symbol].
 * Server Component: fetches profile + quote, then renders.
 */
export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const normalized = symbol.toUpperCase();

  const [profile, quote] = await Promise.all([
    fetchProfile(normalized),
    fetchQuote(normalized),
  ]);

  const isUp = quote.change >= 0;
  const changeColor = isUp ? "text-green-500" : "text-red-500";
  const sign = isUp ? "+" : "";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Back
      </Link>

      <div className="mt-6 flex items-center gap-4">
        {profile.logoUrl && (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white p-2">
            <Image
              src={profile.logoUrl}
              alt={`${profile.symbol} logo`}
              width={40}
              height={40}
              className="h-auto w-auto max-h-10 max-w-10"
            />
          </div>
        )}
        <div>
          <h1 className="font-mono text-2xl font-bold text-zinc-50">
            {profile.symbol}
          </h1>
          <p className="text-zinc-400">{profile.name}</p>
        </div>
      </div>

      <div className="mt-8 flex items-baseline gap-3">
        <span className="font-mono text-4xl font-bold text-zinc-50">
          ${quote.price.toFixed(2)}
        </span>
        <span className={`font-mono text-lg ${changeColor}`}>
          {sign}
          {quote.change.toFixed(2)} ({sign}
          {quote.changePercent.toFixed(2)}%)
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        As of {quote.latestTradingDay}
      </p>
      <PriceChart symbol={profile.symbol} />

      {profile.description && (
        <p className="mt-8 leading-relaxed text-zinc-300">
          {profile.description}
        </p>
      )}

      {profile.homepageUrl && (
        <a
          href={profile.homepageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block text-sm text-blue-400 hover:text-blue-300"
        >
          {profile.homepageUrl}
        </a>
      )}
    </main>
  );
}
