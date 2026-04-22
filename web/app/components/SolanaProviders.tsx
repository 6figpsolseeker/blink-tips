"use client";

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { useMemo, type ReactNode } from "react";
import "@solana/wallet-adapter-react-ui/styles.css";

// Wallet Standard handles wallet registration for any modern Solana wallet
// (Phantom, Solflare, Backpack, etc.) with no explicit adapter list needed.
export function SolanaProviders({
  children,
  rpcUrl,
}: {
  children: ReactNode;
  rpcUrl: string;
}) {
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={rpcUrl}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
