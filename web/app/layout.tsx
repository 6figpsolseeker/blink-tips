import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

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
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
