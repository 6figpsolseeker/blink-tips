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

// Known tokens keyed by mint. Covers both mainnet + devnet USDC so the inbox
// renders correctly regardless of which network we're pointing at.
const KNOWN_MINTS: Record<string, { symbol: string; decimals: number }> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC", decimals: 6 },
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": { symbol: "USDC", decimals: 6 },
};

function mintLabel(mint?: string): string {
  if (!mint) return "SOL";
  return KNOWN_MINTS[mint]?.symbol ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

function scaleToken(raw: string, decimals: number): string {
  const n = BigInt(raw);
  if (decimals === 0) return n.toString();
  const divisor = 10n ** BigInt(decimals);
  const whole = n / divisor;
  const frac = n % divisor;
  const fracStr = frac
    .toString()
    .padStart(decimals, "0")
    .slice(0, Math.min(decimals, 6))
    .replace(/0+$/, "");
  return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
}

function short(s: string) {
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function lamportsToSol(raw: string): string {
  // Work in BigInt for the integer part and only cast the sub-lamport
  // remainder to Number — casting (n / LAMPORTS_PER_SOL) directly can
  // truncate for values over 2^53.
  const n = BigInt(raw);
  const whole = n / LAMPORTS_PER_SOL;
  const frac = n % LAMPORTS_PER_SOL;
  const fracStr = frac.toString().padStart(9, "0").slice(0, 6).replace(/0+$/, "");
  return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
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

  const load = useCallback(
    async (pk: string, isAlive: () => boolean) => {
      // Surface real failures instead of silently falling back to empty
      // lists — previously a two-endpoint-down outage looked the same as
      // a brand-new recipient with no activity.
      const fetchOrLabel = async (
        url: string,
        label: string,
      ): Promise<{ data: unknown; err: string | null }> => {
        try {
          const r = await fetch(url);
          if (!r.ok) return { data: null, err: `${label}: HTTP ${r.status}` };
          return { data: await r.json(), err: null };
        } catch (e) {
          return { data: null, err: `${label}: ${e instanceof Error ? e.message : String(e)}` };
        }
      };

      const [m, v] = await Promise.all([
        fetchOrLabel(`/api/messages?recipient=${pk}`, "messages"),
        fetchOrLabel(`/api/my-vaults?recipient=${pk}`, "vaults"),
      ]);
      if (!isAlive()) return;

      const errs: string[] = [];
      if (m.err) errs.push(m.err);
      if (v.err) errs.push(v.err);
      // Endpoint-level errors returned in body (e.g. 503 with {error})
      const mBody = (m.data ?? {}) as { messages?: Message[]; message?: string };
      const vBody = (v.data ?? {}) as { vaults?: Vault[]; error?: string };
      if (mBody.message) errs.push(`messages: ${mBody.message}`);
      if (vBody.error) errs.push(`vaults: ${vBody.error}`);

      setMsgs(mBody.messages ?? []);
      setVaults(vBody.vaults ?? []);
      setError(errs.length > 0 ? errs.join(" · ") : null);
    },
    [],
  );

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
    load(pk, () => alive).catch((e) => {
      if (alive) setError(String(e));
    });
    return () => {
      alive = false;
    };
  }, [publicKey, load]);

  const refresh = useCallback(() => {
    if (publicKey) void load(publicKey.toBase58(), () => true);
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
              {mintLabel(vault.mint)}
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
              : (() => {
                  const info = vault.mint ? KNOWN_MINTS[vault.mint] : null;
                  if (info) {
                    return `${scaleToken(vault.totalClaimed, info.decimals)} ${info.symbol}`;
                  }
                  return `${vault.totalClaimed} base units`;
                })()}
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
