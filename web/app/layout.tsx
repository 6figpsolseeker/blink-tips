import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "./components/AppProviders";

function resolveRpcUrl(): string {
  if (process.env.RPC_URL) return process.env.RPC_URL;
  const network = (process.env.NETWORK ?? "devnet").toLowerCase();
  return network === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
}

export const metadata: Metadata = {
  metadataBase: new URL("https://blinktips.xyz"),
  title: "blink-tips · recurring Solana tips, one link",
  description:
    "Pull-model recurring tip vaults on Solana, shareable as Blinks. No keepers, no middlemen — deposit once, stream per slot, claim anytime.",
  openGraph: {
    title: "blink-tips",
    description: "Recurring Solana tips, shareable as one Blink.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const rpcUrl = resolveRpcUrl();
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <AppProviders rpcUrl={rpcUrl}>{children}</AppProviders>
      </body>
    </html>
  );
}
