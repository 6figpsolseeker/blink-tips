"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import { useEffect, useRef, useState, type ReactNode } from "react";

type Parameter = {
  name: string;
  label?: string;
  type?: string;
  required?: boolean;
};

type ActionPreset = {
  type: "transaction";
  label: string;
  href: string;
  parameters?: Parameter[];
};

type ActionGetResponse = {
  icon: string;
  label: string;
  title: string;
  description: string;
  links?: { actions: ActionPreset[] };
};

type Status =
  | { kind: "idle" }
  | { kind: "working"; phase: "build" | "sign" | "send" | "confirm"; label?: string }
  | { kind: "success"; signature: string; message?: string }
  | { kind: "error"; message: string; signature?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function phaseLabel(phase: "build" | "sign" | "send" | "confirm"): string {
  return {
    build: "Preparing…",
    sign: "Approve in wallet…",
    send: "Sending…",
    confirm: "Confirming…",
  }[phase];
}

export function CustomBlinkCard({ url }: { url: string }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const [meta, setMeta] = useState<ActionGetResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, Record<string, string>>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  // Synchronous lock so two rapid clicks can't start parallel flows before
  // setBusyIdx's state update reaches the next render.
  const inFlight = useRef(false);

  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`GET failed: ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (alive) setMeta(d);
      })
      .catch((e) => {
        if (alive) setLoadError(e.message ?? String(e));
      });
    return () => {
      alive = false;
    };
  }, [url]);

  const handleClick = async (preset: ActionPreset, idx: number) => {
    // Ref-based mutex: blocks parallel invocations even within the same
    // render tick. setBusyIdx's state update only takes effect on the next
    // render, which is too late if a user double-taps.
    if (inFlight.current) return;
    inFlight.current = true;
    if (!publicKey || !signTransaction) {
      inFlight.current = false;
      setWalletModalVisible(true);
      return;
    }
    // Snapshot the connected account at the start of the flow. If the user
    // changes wallets (or disconnects) mid-flow, we bail instead of signing
    // a tx that was built for a different account.
    const submitAccount = publicKey;

    // Clear any lingering success/error banner from a previous click so the
    // card isn't showing stale state while this next tx is in flight.
    setStatus({ kind: "idle" });

    const values = inputs[String(idx)] ?? {};
    if (preset.parameters) {
      for (const p of preset.parameters) {
        if (p.required && !values[p.name]) {
          setStatus({ kind: "error", message: `Missing: ${p.label ?? p.name}` });
          inFlight.current = false;
          return;
        }
      }
    }

    const href = preset.href.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");
    const absolute = new URL(href, window.location.origin).toString();

    setBusyIdx(idx);
    setStatus({ kind: "working", phase: "build", label: preset.label });

    try {
      const res = await fetch(absolute, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: submitAccount.toBase58() }),
      });
      if (!res.ok) {
        const text = await res.text();
        // Our server returns {"message": "..."} on 4xx/5xx. Prefer that
        // over dumping the raw JSON string into the UI.
        let msg = text;
        try {
          const j = JSON.parse(text);
          if (typeof j?.message === "string") msg = j.message;
        } catch {
          // Not JSON — keep text as-is.
        }
        throw new Error(msg.slice(0, 300));
      }
      const json = await res.json();
      const b64 = json.transaction as string | undefined;
      if (!b64) throw new Error("Server returned no transaction");

      const bytes = base64ToBytes(b64);
      let tx: Transaction | VersionedTransaction;
      try {
        tx = VersionedTransaction.deserialize(bytes);
      } catch {
        tx = Transaction.from(bytes);
      }

      // Defense-in-depth: verify the server-built tx pays from our connected
      // wallet. A compromised server otherwise could return a tx with an
      // arbitrary feePayer and the user would happily sign away funds.
      const feePayer =
        tx instanceof VersionedTransaction
          ? tx.message.staticAccountKeys[0]
          : tx.feePayer ?? null;
      if (!feePayer || !feePayer.equals(submitAccount)) {
        throw new Error(
          "Transaction feePayer does not match the connected wallet — refusing to sign.",
        );
      }
      if (!publicKey || !publicKey.equals(submitAccount)) {
        throw new Error(
          "Wallet changed mid-flow — please click again from the new wallet.",
        );
      }

      // Refresh the blockhash just before signing so a slow wallet click
      // doesn't hit "Blockhash not found". VersionedTransaction message is
      // immutable, so we only do this on the legacy path.
      if (tx instanceof Transaction) {
        try {
          const fresh = await connection.getLatestBlockhash("confirmed");
          tx.recentBlockhash = fresh.blockhash;
          tx.lastValidBlockHeight = fresh.lastValidBlockHeight;
        } catch (e) {
          console.error("[blink] getLatestBlockhash failed", e);
          throw new Error(
            "Couldn't fetch a fresh blockhash from the RPC — please retry in a moment.",
          );
        }
      }

      setStatus({ kind: "working", phase: "sign", label: preset.label });
      const signed = await signTransaction(tx);

      setStatus({ kind: "working", phase: "send", label: preset.label });
      const raw =
        signed instanceof VersionedTransaction
          ? signed.serialize()
          : signed.serialize();
      const signature = await connection.sendRawTransaction(raw, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      setStatus({ kind: "working", phase: "confirm", label: preset.label });
      let landed: { err: unknown; confirmationStatus?: string } | null = null;
      let consecutiveErrors = 0;
      for (let i = 0; i < 90; i++) {
        try {
          const s = await connection.getSignatureStatus(signature, {
            searchTransactionHistory: true,
          });
          consecutiveErrors = 0;
          const val = s.value;
          if (
            val &&
            (val.confirmationStatus === "confirmed" ||
              val.confirmationStatus === "finalized")
          ) {
            landed = val;
            break;
          }
        } catch (pollErr) {
          // Transient RPC failures shouldn't kill the poll — the tx may
          // still be landing. Bail after 10 consecutive errors.
          consecutiveErrors += 1;
          if (consecutiveErrors >= 10) {
            console.error("[blink] getSignatureStatus failing repeatedly", pollErr);
            break;
          }
        }
        await sleep(1000);
      }

      if (!landed) {
        setStatus({
          kind: "error",
          message:
            "Confirmation timed out. The transaction may still land — check Solscan.",
          signature,
        });
        return;
      }
      if (landed.err) {
        setStatus({
          kind: "error",
          message: `On-chain error: ${JSON.stringify(landed.err)}`,
          signature,
        });
        return;
      }

      setStatus({
        kind: "success",
        signature,
        message: json.message ?? "Transaction confirmed.",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Silently reset on wallet rejection — the user pressed "Cancel",
      // they don't need a scary red error telling them that.
      // Match a broader set of wallet-rejection phrasings:
      //   "User rejected the request"       (Phantom)
      //   "User denied signing"             (Solflare)
      //   "Transaction was cancelled"       (past-tense, some wallets)
      //   "Signature request was rejected"  (common wrapper)
      //   "Rejected by the user"            (older phrasing)
      //   "Approval denied"                 (Backpack variant)
      const rejectionRe =
        /(?:user|request|transaction|approval|sign(?:ing|ature)?)\s+(?:request\s+)?(?:was\s+)?(?:rejected|denied|cancell?ed|aborted)|(?:rejected|cancell?ed|denied)\s+by\s+(?:the\s+)?user/i;
      if (rejectionRe.test(msg)) {
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({ kind: "error", message: msg });
    } finally {
      setBusyIdx(null);
      inFlight.current = false;
    }
  };

  if (loadError) {
    return (
      <Card>
        <p className="text-sm text-red-400">Could not load Blink: {loadError}</p>
      </Card>
    );
  }
  if (!meta) {
    return (
      <Card>
        <p className="text-sm text-neutral-400">Loading the tip card…</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={meta.icon}
          alt=""
          className="h-20 w-20 shrink-0 rounded-md border border-neutral-900 object-cover"
        />
        <div>
          <h3 className="font-semibold text-neutral-100">{meta.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-neutral-400">
            {meta.description}
          </p>
        </div>
      </div>

      <div className="my-5 h-px bg-neutral-900" />

      {!connected ? (
        <button
          type="button"
          onClick={() => setWalletModalVisible(true)}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-black transition hover:bg-accent-muted"
        >
          Connect wallet to tip
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          {meta.links?.actions.map((preset, idx) => (
            <PresetRow
              key={idx}
              preset={preset}
              idx={idx}
              busy={busyIdx === idx}
              anyBusy={busyIdx !== null}
              phaseText={
                busyIdx === idx && status.kind === "working"
                  ? phaseLabel(status.phase)
                  : null
              }
              inputs={inputs[String(idx)] ?? {}}
              setInput={(name, val) =>
                setInputs((prev) => ({
                  ...prev,
                  [String(idx)]: { ...prev[String(idx)], [name]: val },
                }))
              }
              onSubmit={() => handleClick(preset, idx)}
            />
          ))}
        </div>
      )}

      {(status.kind === "success" || status.kind === "error") && (
        <StatusStrip status={status} />
      )}
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-5">
      {children}
    </div>
  );
}

function PresetRow({
  preset,
  idx,
  busy,
  anyBusy,
  phaseText,
  inputs,
  setInput,
  onSubmit,
}: {
  preset: ActionPreset;
  idx: number;
  busy: boolean;
  anyBusy: boolean;
  phaseText: string | null;
  inputs: Record<string, string>;
  setInput: (name: string, val: string) => void;
  onSubmit: () => void;
}) {
  const hasForm = preset.parameters && preset.parameters.length > 0;
  return (
    <div className="rounded-md border border-neutral-900 bg-black/30 p-3">
      {hasForm && (
        <div className="mb-3 flex flex-col gap-2">
          {preset.parameters!.map((p) => (
            <input
              key={p.name}
              type={p.type === "number" ? "number" : "text"}
              inputMode={p.type === "number" ? "decimal" : undefined}
              placeholder={p.label ?? p.name}
              value={inputs[p.name] ?? ""}
              onChange={(e) => setInput(p.name, e.target.value)}
              className="w-full rounded-md border border-neutral-800 bg-black/40 px-3 py-2 font-mono text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-accent/60 focus:ring-2 focus:ring-accent/30"
            />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onSubmit}
        disabled={anyBusy}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy && phaseText ? phaseText : preset.label}
      </button>
    </div>
  );
}

function StatusStrip({
  status,
}: {
  status: Extract<Status, { kind: "success" | "error" }>;
}) {
  if (status.kind === "success") {
    return (
      <div className="mt-5 rounded-md border border-emerald-900/60 bg-emerald-950/40 p-3 text-sm">
        <div className="text-emerald-300">{status.message}</div>
        <a
          href={`https://solscan.io/tx/${status.signature}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block break-all text-xs text-emerald-400/80 underline"
        >
          View on Solscan: {status.signature.slice(0, 24)}…
        </a>
      </div>
    );
  }
  return (
    <div className="mt-5 rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-300">
      <div>{status.message}</div>
      {status.signature && (
        <a
          href={`https://solscan.io/tx/${status.signature}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block break-all text-xs text-red-400/80 underline"
        >
          Signature: {status.signature.slice(0, 24)}…
        </a>
      )}
    </div>
  );
}
