"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useCallback, useEffect, useState } from "react";
import { ClaimButton } from "./ClaimButton";

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

type Vault = {
  address: string;
  type: "sol" | "token";
  tipper: string;
  mint?: string;
  ratePerSlot: string;
  lastClaimSlot: string;
  totalClaimed: string;
  currentLamports?: string;
};

const LAMPORTS_PER_SOL = 1_000_000_000n;

function short(s: string) {
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function lamportsToSol(raw: string): string {
  const n = BigInt(raw);
  const whole = Number(n / LAMPORTS_PER_SOL);
  const frac = Number(n - (n / LAMPORTS_PER_SOL) * LAMPORTS_PER_SOL) / 1e9;
  return (whole + frac).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
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
  const [vaults, setVaults] = useState<Vault[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (pk: string) => {
    setError(null);
    const [m, v] = await Promise.all([
      fetch(`/api/messages?recipient=${pk}`)
        .then((r) => r.json())
        .catch(() => ({ messages: [] })),
      fetch(`/api/my-vaults?recipient=${pk}`)
        .then((r) => r.json())
        .catch(() => ({ vaults: [] })),
    ]);
    setMsgs(m.messages ?? []);
    setVaults(v.vaults ?? []);
    if (m.message) setError(m.message);
    if (v.error) setError(v.error);
  }, []);

  useEffect(() => {
    if (!publicKey) {
      setMsgs(null);
      setVaults(null);
      return;
    }
    let alive = true;
    const pk = publicKey.toBase58();
    setMsgs(null);
    setVaults(null);
    load(pk).catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [publicKey, load]);

  const refresh = useCallback(() => {
    if (publicKey) void load(publicKey.toBase58());
  }, [publicKey, load]);

  if (!connected || !publicKey) {
    return (
      <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-6">
        <p className="text-sm text-neutral-400">
          Connect a wallet to see your vaults and messages.
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

  const loading = msgs === null || vaults === null;

  return (
    <div className="flex flex-col gap-10">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-widest text-neutral-500">
            Your vaults
          </h2>
          <span className="text-xs text-neutral-600">
            {loading ? "…" : `${vaults!.length} open`}
          </span>
        </div>
        {loading ? (
          <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-4 text-sm text-neutral-500">
            Loading vaults…
          </div>
        ) : vaults!.length === 0 ? (
          <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-4 text-sm text-neutral-500">
            No vaults yet. Share your tip link to receive your first subscription.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {vaults!.map((v) => (
              <VaultRow
                key={v.address}
                vault={v}
                recipient={publicKey.toBase58()}
                onClaimed={refresh}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-widest text-neutral-500">
            Messages
          </h2>
          <span className="text-xs text-neutral-600">
            {loading ? "…" : `${msgs!.length}`}
          </span>
        </div>
        {loading ? (
          <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-4 text-sm text-neutral-500">
            Loading messages…
          </div>
        ) : msgs!.length === 0 ? (
          <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-4 text-sm text-neutral-500">
            No messages yet.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {msgs!.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                onClaimed={refresh}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function VaultRow({
  vault,
  recipient,
  onClaimed,
}: {
  vault: Vault;
  recipient: string;
  onClaimed: () => void;
}) {
  return (
    <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-xs text-neutral-400">
          from {short(vault.tipper)}
          {vault.type === "token" && vault.mint && (
            <span className="ml-2 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-500">
              {vault.mint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
                ? "USDC"
                : short(vault.mint)}
            </span>
          )}
        </div>
        <ClaimButton
          tipper={vault.tipper}
          recipient={recipient}
          onSuccess={onClaimed}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-neutral-500 sm:grid-cols-3">
        <div>
          <div className="text-neutral-600">Total claimed</div>
          <div className="mt-0.5 font-mono text-neutral-200">
            {vault.type === "sol"
              ? `${lamportsToSol(vault.totalClaimed)} SOL`
              : vault.totalClaimed}
          </div>
        </div>
        <div>
          <div className="text-neutral-600">Rate / slot</div>
          <div className="mt-0.5 font-mono text-neutral-200">{vault.ratePerSlot}</div>
        </div>
        {vault.currentLamports && (
          <div>
            <div className="text-neutral-600">In vault</div>
            <div className="mt-0.5 font-mono text-neutral-200">
              {lamportsToSol(vault.currentLamports)} SOL
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageRow({
  message,
  onClaimed,
}: {
  message: Message;
  onClaimed: () => void;
}) {
  return (
    <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-4">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span className="font-mono">
          {message.anonymous
            ? "Anonymous"
            : (message.displayName ?? short(message.tipper))}
          {!message.anonymous && message.displayName && (
            <span className="ml-2 text-neutral-600">
              ({short(message.tipper)})
            </span>
          )}
        </span>
        <span>{formatTime(message.createdAt)}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-100">
        {message.text}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
        {message.amount && (
          <span className="rounded-md border border-neutral-800 px-2 py-0.5 font-mono">
            {message.amount}{" "}
            {!message.mint || message.mint === "SOL"
              ? "SOL"
              : message.mint.toUpperCase()}
          </span>
        )}
        {message.txSignature && (
          <a
            href={`https://solscan.io/tx/${message.txSignature}`}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-neutral-200"
          >
            tx
          </a>
        )}
        {!message.anonymous && (
          <ClaimButton
            tipper={message.tipper}
            recipient={message.recipient}
            onSuccess={onClaimed}
          />
        )}
      </div>
    </div>
  );
}
