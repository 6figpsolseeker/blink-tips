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
// Idle gap before cycling another backlog message. New messages skip this —
// they show immediately after the current toast clears.
const BACKLOG_IDLE_MS = 2_000;
// Cap the in-memory backlog. Server-side msgs:feed:global is trimmed to 200
// too; this prevents long-lived tabs from accumulating unbounded IDs as the
// server rotates its window over hours.
const MAX_BACKLOG = 200;

export function TipFeedToast() {
  // Unseen-this-session new messages — always shown before anything else.
  const [newQueue, setNewQueue] = useState<Message[]>([]);
  // Pool of every message we've ever seen (including historical from page
  // load). Round-robined through when newQueue is empty so the feed keeps
  // cycling "previously said" messages during quiet periods.
  const [backlog, setBacklog] = useState<Message[]>([]);
  const [current, setCurrent] = useState<{ msg: Message; isNew: boolean } | null>(null);
  const [visible, setVisible] = useState(false);

  const seenIds = useRef<Set<string>>(new Set());
  const booted = useRef(false);
  const backlogIdx = useRef(0);

  // Poll /api/feed every POLL_MS. First fetch populates the backlog silently
  // (so users aren't flooded with historical toasts on page load). Subsequent
  // fetches treat any unseen message as a priority "new" one.
  useEffect(() => {
    let alive = true;

    const fetchFeed = async () => {
      try {
        const res = await fetch("/api/feed");
        if (!res.ok) return;
        const data = (await res.json()) as { messages?: Message[] };
        if (!alive) return;
        const incoming = data.messages ?? [];
        const newlyDiscovered: Message[] = [];
        const trulyNew: Message[] = [];
        // Feed is newest-first; iterate reverse so we enqueue oldest-first.
        for (let i = incoming.length - 1; i >= 0; i -= 1) {
          const m = incoming[i];
          if (!seenIds.current.has(m.id)) {
            seenIds.current.add(m.id);
            newlyDiscovered.push(m);
            if (booted.current) trulyNew.push(m);
          }
        }
        if (newlyDiscovered.length > 0) {
          setBacklog((b) => {
            const merged = [...b, ...newlyDiscovered];
            return merged.length > MAX_BACKLOG
              ? merged.slice(merged.length - MAX_BACKLOG)
              : merged;
          });
        }
        if (trulyNew.length > 0) {
          setNewQueue((q) => [...q, ...trulyNew]);
        }
        if (!booted.current) booted.current = true;
      } catch {
        // Silent — the toast is a nice-to-have.
      }
    };

    void fetchFeed();
    const id = setInterval(fetchFeed, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Drive the fade + auto-clear when `current` is set.
  useEffect(() => {
    if (!current) return;
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), VISIBLE_MS);
    const clear = setTimeout(() => setCurrent(null), VISIBLE_MS + FADE_MS);
    return () => {
      clearTimeout(hide);
      clearTimeout(clear);
    };
  }, [current]);

  // Pull the next toast once nothing is showing. New messages go immediately;
  // backlog messages wait BACKLOG_IDLE_MS to avoid constant churn.
  useEffect(() => {
    if (current) return;
    if (newQueue.length === 0 && backlog.length === 0) return;

    const pick = () => {
      if (newQueue.length > 0) {
        const [head, ...rest] = newQueue;
        setNewQueue(rest);
        setCurrent({ msg: head, isNew: true });
      } else if (backlog.length > 0) {
        const next = backlog[backlogIdx.current % backlog.length];
        backlogIdx.current += 1;
        setCurrent({ msg: next, isNew: false });
      }
    };

    if (newQueue.length > 0) {
      pick();
      return;
    }
    const t = setTimeout(pick, BACKLOG_IDLE_MS);
    return () => clearTimeout(t);
  }, [current, newQueue, backlog]);

  if (!current) return null;
  const msg = current.msg;
  const attribution = msg.anonymous
    ? "Anonymous"
    : (msg.displayName ?? short(msg.tipper));
  const amountLabel = msg.amount
    ? `${msg.amount} ${labelMint(msg.mint)}`
    : null;

  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed bottom-4 right-4 z-50 max-w-[22rem] px-2 transition-all duration-500 sm:max-w-md ${
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <div className="pointer-events-auto rounded-xl border border-neutral-800 bg-neutral-950/90 p-3 shadow-[0_0_40px_-20px_rgba(156,175,136,0.55)] backdrop-blur">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-neutral-500">
          <span>{current.isNew ? "New tip" : "Recent tip"}</span>
          {amountLabel && (
            <span className="font-mono text-accent">{amountLabel}</span>
          )}
        </div>
        <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-neutral-100">
          {msg.text}
        </p>
        <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
          <span className="truncate font-mono">{attribution}</span>
          <span className="ml-2 whitespace-nowrap">→ {short(msg.recipient)}</span>
        </div>
      </div>
    </div>
  );
}
