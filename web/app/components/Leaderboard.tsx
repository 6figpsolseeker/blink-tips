"use client";

import { useEffect, useState } from "react";

type Row = { recipient: string; totalClaimedLamports: string };
type Data = { top: Row[]; error?: string };

const LAMPORTS_PER_SOL = 1_000_000_000n;

function lamportsToSolDisplay(raw: string): string {
  const n = BigInt(raw);
  const whole = n / LAMPORTS_PER_SOL;
  const frac = n - whole * LAMPORTS_PER_SOL;
  if (frac === 0n) return `${whole} SOL`;
  // Show up to 4 significant decimals
  const decimal = Number(frac) / 1e9;
  return `${(Number(whole) + decimal).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  })} SOL`;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function Leaderboard() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => alive && setData(d))
      .catch((e) => alive && setData({ top: [], error: String(e) }));
    return () => {
      alive = false;
    };
  }, []);

  const hasData = data && data.top.length > 0;

  return (
    <section id="leaderboard" className="border-t border-neutral-900 py-16">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-medium uppercase tracking-widest text-neutral-500">
          Leaderboard
        </h2>
        {!hasData && (
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
            Coming soon
          </span>
        )}
      </div>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-400">
        {hasData
          ? "Solana wallets receiving the most SOL across blink-tips vaults. Live from on-chain data; refreshes every minute."
          : "An on-chain ranking of the Solana wallets receiving the most tips across blink-tips vaults. Aggregated from vault totals; no opt-in required."}
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-neutral-900 bg-neutral-950/60">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-neutral-900 px-5 py-3 text-[10px] uppercase tracking-widest text-neutral-600">
          <span>Rank</span>
          <span>Recipient</span>
          <span>Total tipped</span>
        </div>
        {hasData
          ? data!.top.map((row, i) => (
              <a
                key={row.recipient}
                href={`/tip/${row.recipient}`}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-neutral-900 px-5 py-4 last:border-b-0 transition hover:bg-neutral-900/40"
              >
                <span className="font-mono text-sm text-neutral-600">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-mono text-xs text-neutral-200">
                  {shortAddr(row.recipient)}
                </span>
                <span className="font-mono text-xs text-neutral-200">
                  {lamportsToSolDisplay(row.totalClaimedLamports)}
                </span>
              </a>
            ))
          : [1, 2, 3, 4, 5].map((r) => (
              <div
                key={r}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-neutral-900 px-5 py-4 last:border-b-0"
              >
                <span className="font-mono text-sm text-neutral-600">
                  {String(r).padStart(2, "0")}
                </span>
                <span className="h-3 w-40 rounded bg-neutral-900/80" />
                <span className="h-3 w-16 rounded bg-neutral-900/80" />
              </div>
            ))}
      </div>
    </section>
  );
}
