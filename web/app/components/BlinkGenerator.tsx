"use client";

import { useEffect, useState } from "react";

const BASE58_PUBKEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function BlinkGenerator() {
  const [pubkey, setPubkey] = useState("");
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const touched = pubkey.length > 0;
  const isValid = BASE58_PUBKEY.test(pubkey);
  const url = isValid ? `${origin}/tip/${pubkey}` : "";
  const short = isValid ? `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}` : "…";

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div>
        <label htmlFor="pubkey" className="block text-sm text-neutral-400">
          Recipient Solana pubkey
        </label>
        <input
          id="pubkey"
          value={pubkey}
          onChange={(e) => setPubkey(e.target.value.trim())}
          placeholder="e.g. 4Nd1mBQ...pump"
          spellCheck={false}
          autoComplete="off"
          className={`mt-2 w-full rounded-md border bg-black/40 px-3 py-2 font-mono text-sm outline-none transition placeholder:text-neutral-600 focus:ring-2 ${
            touched && !isValid
              ? "border-red-900/60 focus:ring-red-900/40"
              : "border-neutral-800 focus:border-accent/60 focus:ring-accent/30"
          }`}
        />
        <p className="mt-2 h-4 text-xs text-neutral-500">
          {touched && !isValid ? "Not a valid base58 pubkey." : "\u00A0"}
        </p>

        <div className="mt-4">
          <div className="text-sm text-neutral-400">Shareable Blink URL</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-neutral-800 bg-black/40 px-3 py-2 font-mono text-xs text-neutral-300">
              {url || `${origin || "https://…"}/tip/<pubkey>`}
            </code>
            <button
              type="button"
              onClick={copy}
              disabled={!url}
              className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-200 transition hover:border-accent/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-800 disabled:hover:text-neutral-200"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <ShareOnX url={url} />
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Paste this into X, Discord, Telegram, or any Blinks-aware client.
          </p>
        </div>
      </div>

      <BlinkPreview short={short} valid={isValid} />
    </div>
  );
}

function ShareOnX({ url }: { url: string }) {
  const disabled = !url;
  const text = "Tip me on-chain. One click opens a recurring Solana vault.";
  const href = disabled
    ? undefined
    : `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const className =
    "inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-200 transition hover:border-accent/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-800 disabled:hover:text-neutral-200";

  const icon = (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2H21l-6.52 7.45L22 22h-6.18l-4.83-6.32L5.5 22H3l7-8L2 2h6.31l4.38 5.77L18.244 2Zm-1.084 18h1.66L7.01 4H5.24l11.92 16Z" />
    </svg>
  );

  if (disabled) {
    return (
      <button type="button" disabled className={className}>
        {icon}
        <span>Share</span>
      </button>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {icon}
      <span>Share</span>
    </a>
  );
}

function BlinkPreview({ short, valid }: { short: string; valid: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 shadow-[0_0_40px_-20px_rgba(156,175,136,0.5)]">
      <div className="text-[10px] uppercase tracking-widest text-neutral-600">
        Preview · as rendered in a Blinks client
      </div>
      <div className="mt-3 flex gap-3">
        <div className="h-20 w-20 shrink-0 rounded-md bg-gradient-to-br from-accent to-accent-muted" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-neutral-100">
            Tip {short}
          </div>
          <div className="mt-1 text-xs leading-relaxed text-neutral-400">
            Open a recurring tip vault. Funds stream per-slot; recipient claims
            anytime.
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {["0.1 SOL / 7d", "0.5 SOL / 30d", "Custom"].map((label) => (
          <button
            key={label}
            type="button"
            disabled={!valid}
            className="rounded-md border border-neutral-800 bg-black/40 px-2 py-1.5 text-xs text-neutral-300 transition hover:border-accent/50 hover:text-white disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
