import Image from "next/image";
import type { PopularStockItem } from "../types/stock";

/**
 * Tabular display of stock quotes. Each row shows symbol, name, current
 * price, and the day's change (color-coded green/red).
 *
 * Logos are served as static files from /public/logos/ (downloaded at seed
 * time), so they load from the same origin with no auth or CORS concerns.
 * A letter-based avatar is shown as a fallback when no logo exists.
 */
export function StockTable({ items }: { items: PopularStockItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-zinc-500 dark:text-zinc-400">
        No stocks available right now.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-left">
        <thead className="bg-zinc-100 dark:bg-zinc-900">
          <tr>
            <th className="px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Symbol
            </th>
            <th className="px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Name
            </th>
            <th className="px-4 py-3 text-right text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Price
            </th>
            <th className="px-4 py-3 text-right text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Change
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {items.map((item) => (
            <StockRow key={item.symbol} item={item} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Deterministic fallback color when a stock has no logo.
 */
function avatarColor(symbol: string): string {
  const palette = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-violet-500",
    "bg-cyan-500",
  ];
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash += symbol.charCodeAt(i);
  }
  return palette[hash % palette.length];
}

function StockRow({ item }: { item: PopularStockItem }) {
  const isUp = item.change >= 0;
  const changeColor = isUp
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";

  const priceText = `$${item.price.toFixed(2)}`;
  const sign = isUp ? "+" : "";
  const changeText = `${sign}${item.change.toFixed(2)}`;
  const percentText = `${sign}${item.changePercent.toFixed(2)}%`;

  return (
    <tr className="bg-white hover:bg-zinc-50 dark:bg-black dark:hover:bg-zinc-900">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {item.logoUrl ? (
            <div className="flex h-8 w-8 items-center justify-center rounded bg-white p-1">
              <Image
                src={item.logoUrl}
                alt={`${item.symbol} logo`}
                width={24}
                height={24}
                className="h-auto w-auto max-h-6 max-w-6"
              />
            </div>
          ) : (
            <div
              className={`flex h-8 w-8 items-center justify-center rounded text-xs font-bold text-white ${avatarColor(
                item.symbol,
              )}`}
            >
              {item.symbol.slice(0, 2)}
            </div>
          )}
          <span className="font-mono font-medium text-zinc-900 dark:text-zinc-50">
            {item.symbol}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
        {item.name}
      </td>
      <td className="px-4 py-3 text-right font-mono text-zinc-900 dark:text-zinc-50">
        {priceText}
      </td>
      <td className={`px-4 py-3 text-right font-mono ${changeColor}`}>
        <div>{changeText}</div>
        <div className="text-xs">{percentText}</div>
      </td>
    </tr>
  );
}
