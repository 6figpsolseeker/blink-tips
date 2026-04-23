"use client";

import type { ReactNode } from "react";
import { SolanaProviders } from "./SolanaProviders";

// Plain client wrapper — SolanaProviders itself is marked "use client" and
// the modern wallet-adapter is SSR-friendly, so no dynamic import needed.
// Using dynamic(ssr:false) at the root would block SSR for the whole app.
export function AppProviders({
  children,
  rpcUrl,
}: {
  children: ReactNode;
  rpcUrl: string;
}) {
  return <SolanaProviders rpcUrl={rpcUrl}>{children}</SolanaProviders>;
}
