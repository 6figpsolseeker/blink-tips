"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import { useRef, useState } from "react";

function base64ToBytes(b64: string): Uint8Array {
  const std = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = std + "=".repeat((4 - (std.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const REJECTION_RE =
  /(?:user|request|transaction|approval|sign(?:ing|ature)?)\s+(?:request\s+)?(?:was\s+)?(?:rejected|denied|cancell?ed|aborted)|(?:rejected|cancell?ed|denied)\s+by\s+(?:the\s+)?user/i;

type Status =
  | { kind: "idle" }
  | { kind: "busy"; phase: "build" | "sign" | "send" | "confirm" }
  | { kind: "ok"; signature: string }
  | { kind: "err"; message: string };

export function ClaimButton({
  tipper,
  recipient,
  onSuccess,
}: {
  tipper: string;
  recipient: string;
  onSuccess?: () => void;
}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Synchronous mutex — React state updates lag behind the click event, so
  // the visually-disabled button can still fire twice in a row. A ref
  // blocks re-entry immediately.
  const inFlight = useRef(false);

  const phaseLabel = (p: "build" | "sign" | "send" | "confirm") =>
    ({ build: "Preparing…", sign: "Approve…", send: "Sending…", confirm: "Confirming…" })[p];

  const claim = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!publicKey || !signTransaction) {
      inFlight.current = false;
      setStatus({ kind: "err", message: "Connect your wallet first" });
      return;
    }
    // Snapshot the connected account before any async work. If the user
    // switches wallets mid-flow we bail instead of signing a tx for the
    // wrong key.
    const submitAccount = publicKey;
    setStatus({ kind: "busy", phase: "build" });
    try {
      const res = await fetch(`/api/actions/claim/${tipper}/${recipient}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: submitAccount.toBase58() }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = text;
        try {
          const j = JSON.parse(text);
          if (typeof j?.message === "string") msg = j.message;
        } catch {}
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

      // Defense-in-depth: verify the server-built tx pays from our wallet.
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
          "Wallet changed mid-flow — please click Claim again from the new wallet.",
        );
      }

      // Refresh the blockhash right before signing. Wrapped so a Helius hiccup
      // surfaces as a readable error instead of a generic "fetch failed".
      if (tx instanceof Transaction) {
        try {
          const fresh = await connection.getLatestBlockhash("confirmed");
          tx.recentBlockhash = fresh.blockhash;
          tx.lastValidBlockHeight = fresh.lastValidBlockHeight;
        } catch (e) {
          console.error("[claim] getLatestBlockhash failed", e);
          throw new Error(
            "Couldn't fetch a fresh blockhash from the RPC — please retry in a moment.",
          );
        }
      }

      setStatus({ kind: "busy", phase: "sign" });
      const signed = await signTransaction(tx);

      setStatus({ kind: "busy", phase: "send" });
      const raw = signed.serialize();
      const signature = await connection.sendRawTransaction(raw, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      setStatus({ kind: "busy", phase: "confirm" });
      let landed: { err: unknown; confirmationStatus?: string } | null = null;
      let fails = 0;
      for (let i = 0; i < 90; i++) {
        try {
          const s = await connection.getSignatureStatus(signature, {
            searchTransactionHistory: true,
          });
          fails = 0;
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
          fails += 1;
          if (fails >= 10) {
            console.error("[claim] getSignatureStatus failing repeatedly", pollErr);
            break;
          }
        }
        await sleep(1000);
      }
      if (!landed) {
        setStatus({
          kind: "err",
          message: "Confirmation timed out — the tx may still land, check Solscan.",
        });
        return;
      }
      if (landed.err) {
        setStatus({
          kind: "err",
          message: `On-chain error: ${JSON.stringify(landed.err)}`,
        });
        return;
      }
      setStatus({ kind: "ok", signature });
      onSuccess?.();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (REJECTION_RE.test(m)) {
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({ kind: "err", message: m });
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={claim}
        disabled={status.kind === "busy"}
        className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-black transition hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status.kind === "busy" ? phaseLabel(status.phase) : "Claim"}
      </button>
      {status.kind === "ok" && (
        <a
          href={`https://solscan.io/tx/${status.signature}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-emerald-400 underline"
        >
          claimed ↗
        </a>
      )}
      {status.kind === "err" && (
        <span className="text-xs text-red-400" title={status.message}>
          {status.message.length > 60 ? status.message.slice(0, 60) + "…" : status.message}
        </span>
      )}
    </div>
  );
}
