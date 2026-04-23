"use client";

import { useEffect, useState } from "react";

type Message = {
  id: string;
  tipper: string;
  recipient: string;
  text: string;
  displayName: string | null;
  anonymous: boolean;
  txSignature: string | null;
  amount: string | null;
  mint: string | null;
  createdAt: number;
};

function short(s: string) {
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TipperMessages({
  tipper,
  recipient,
}: {
  tipper: string;
  recipient: string;
}) {
  const [msgs, setMsgs] = useState<Message[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(
      `/api/messages?recipient=${recipient}&tipper=${tipper}`,
    )
      .then((r) => r.json())
      .then((d) => alive && setMsgs(d.messages ?? []))
      .catch(() => alive && setMsgs([]));
    return () => {
      alive = false;
    };
  }, [tipper, recipient]);

  if (!msgs || msgs.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-neutral-900 bg-neutral-950/60 p-4">
      <div className="text-[10px] uppercase tracking-widest text-neutral-600">
        Messages from this tipper
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {msgs.map((m) => (
          <div key={m.id} className="border-l-2 border-accent/40 pl-3">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>
                {m.anonymous
                  ? "Anonymous"
                  : (m.displayName ?? short(m.tipper))}
              </span>
              <span>{formatTime(m.createdAt)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-100">
              {m.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
