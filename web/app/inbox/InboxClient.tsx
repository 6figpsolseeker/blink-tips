"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
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

export function InboxClient() {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setMsgs(null);
      return;
    }
    let alive = true;
    setMsgs(null);
    setError(null);
    fetch(`/api/messages?recipient=${publicKey.toBase58()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.message) setError(d.message);
        else setMsgs(d.messages ?? []);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [publicKey]);

  if (!connected) {
    return (
      <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-6">
        <p className="text-sm text-neutral-400">
          Connect a wallet to read messages sent to that address.
        </p>
        <button
          type="button"
          onClick={() => setVisible(true)}
          className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition hover:bg-accent-muted"
        >
          Connect wallet
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-6 text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (msgs === null) {
    return (
      <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-6 text-sm text-neutral-400">
        Loading messages…
      </div>
    );
  }

  if (msgs.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-6 text-sm text-neutral-400">
        No messages yet. Share your tip link to receive your first note.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {msgs.map((m) => (
        <div
          key={m.id}
          className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-4"
        >
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span className="font-mono">
              {m.anonymous
                ? "Anonymous"
                : (m.displayName ?? short(m.tipper))}
              {!m.anonymous && m.displayName && (
                <span className="ml-2 text-neutral-600">({short(m.tipper)})</span>
              )}
            </span>
            <span>{formatTime(m.createdAt)}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-100">
            {m.text}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
            {m.amount && (
              <span className="rounded-md border border-neutral-800 px-2 py-0.5 font-mono">
                {m.amount}{" "}
                {!m.mint || m.mint === "SOL" ? "SOL" : m.mint.toUpperCase()}
              </span>
            )}
            {m.txSignature && (
              <a
                href={`https://solscan.io/tx/${m.txSignature}`}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-neutral-200"
              >
                tx
              </a>
            )}
            {!m.anonymous && (
              <a
                href={`/claim/${m.tipper}/${m.recipient}`}
                className="underline hover:text-neutral-200"
              >
                claim from this tipper
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
