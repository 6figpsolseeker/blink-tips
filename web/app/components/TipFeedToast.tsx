"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  tipper: string;
  recipient: string;
  text: string;
  displayName: string | null;
  anonymous: boolean;
  amount: string | null;
  mint: string | null;
  createdAt: number;
};

const KNOWN_MINT_SYMBOL: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": "USDC",
};

function short(s: string): string {
  if (!s) return "—";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function labelMint(raw: string | null | undefined): string {
  if (!raw || raw === "SOL") return "SOL";
  return KNOWN_MINT_SYMBOL[raw] ?? raw.toUpperCase().slice(0, 6);
}

const POLL_MS = 15_000;
const VISIBLE_MS = 6_000;
const FADE_MS = 500;

export function TipFeedToast() {
  const [queue, setQueue] = useState<Message[]>([]);
  const [current, setCurrent] = useState<Message | null>(null);
  const [visible, setVisible] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());
  const booted = useRef(false);

  // Poll the global feed every POLL_MS. On the very first fetch we mark
  // everything as already-seen so the user isn't flooded with historical
  // popups as soon as they land on the site.
  useEffect(() => {
    let alive = true;

    const fetchFeed = async () => {
      try {
        const res = await fetch("/api/feed");
        if (!res.ok) return;
        const data = (await res.json()) as { messages?: Message[] };
        if (!alive) return;
        const incoming = data.messages ?? [];
        if (!booted.current) {
          for (const m of incoming) seenIds.current.add(m.id);
          booted.current = true;
          return;
        }
        const fresh: Message[] = [];
        // Feed returns newest-first; enqueue oldest-first so toasts appear in
        // chronological order.
        for (let i = incoming.length - 1; i >= 0; i -= 1) {
          const m = incoming[i];
          if (!seenIds.current.has(m.id)) {
            seenIds.current.add(m.id);
            fresh.push(m);
          }
        }
        if (fresh.length > 0) {
          setQueue((q) => [...q, ...fresh]);
        }
      } catch {
        // Silent — the toast is a nice-to-have; swallow transient network errors.
      }
    };

    void fetchFeed();
    const id = setInterval(fetchFeed, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Drain the queue one at a time: show for VISIBLE_MS, fade over FADE_MS.
  useEffect(() => {
    if (current) return;
    if (queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), VISIBLE_MS);
    const clear = setTimeout(() => setCurrent(null), VISIBLE_MS + FADE_MS);
    return () => {
      clearTimeout(hide);
      clearTimeout(clear);
    };
  }, [queue, current]);

  if (!current) return null;

  const attribution = current.anonymous
    ? "Anonymous"
    : (current.displayName ?? short(current.tipper));
  const amountLabel = current.amount
    ? `${current.amount} ${labelMint(current.mint)}`
    : null;

  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed bottom-4 right-4 z-50 max-w-[22rem] px-2 transition-all duration-500 sm:max-w-md ${
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-4 opacity-0"
      }`}
    >
      <div className="pointer-events-auto rounded-xl border border-neutral-800 bg-neutral-950/90 p-3 shadow-[0_0_40px_-20px_rgba(156,175,136,0.55)] backdrop-blur">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-neutral-500">
          <span>New tip</span>
          {amountLabel && <span className="font-mono text-accent">{amountLabel}</span>}
        </div>
        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-neutral-100">
          {current.text}
        </p>
        <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
          <span className="truncate font-mono">{attribution}</span>
          <span className="ml-2 whitespace-nowrap">→ {short(current.recipient)}</span>
        </div>
      </div>
    </div>
  );
}
