"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fetchHistory } from "../../../lib/api";
import type { DailyBar, HistoryRange } from "../../../types/stock";
import { Noto_Sans_Old_Italic, Yellowtail } from "next/font/google";

const RANGES: HistoryRange[] = ["7d", "30d", "1y"];

/**
 * Interactive price chart with range switching.
 * Client Component: uses state for the selected range and fetches on change.
 */
export function PriceChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<HistoryRange>("30d");
  const [bars, setBars] = useState<DailyBar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchHistory(symbol, range).then((data) => {
      if (!cancelled) {
        setBars(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, range]);

  return (
    <div className="mt-8">
      <div className="mb-4 flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded px-3 py-1 text-sm ${
              r === range
                ? "bg-blue-500 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading chart…</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={bars}>
            <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#b8b8c5" />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 12 }}
              stroke="#b8b8c5"
            />
            <Tooltip
              contentStyle={{
                padding: 10,
                backgroundColor: "#b8b8c5",
                color: "#151557",
                fontFamily: "var(--font-geist-mono) ",
              }}
            />
            <Line
              type="monotone"
              dataKey="close"
              stroke="#3b82f6"
              dot={false}
              activeDot={{ r: 3, fill: "#ffffff" }}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
