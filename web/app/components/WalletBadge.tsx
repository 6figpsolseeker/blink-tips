"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export function WalletBadge() {
  const { publicKey, connected, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();

  if (!connected || !publicKey) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        disabled={connecting}
        className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black transition hover:bg-accent-muted disabled:opacity-50"
      >
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const s = publicKey.toBase58();
  const short = `${s.slice(0, 4)}…${s.slice(-4)}`;
  return (
    <button
      type="button"
      onClick={() => disconnect()}
      className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 font-mono text-[11px] text-neutral-200 transition hover:border-red-800/70 hover:text-red-300"
      title="Click to disconnect"
    >
      {short}
    </button>
  );
}
