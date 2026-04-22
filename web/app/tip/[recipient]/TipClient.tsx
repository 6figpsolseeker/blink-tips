"use client";

import dynamic from "next/dynamic";

// Solana wallet adapter + Dialect Blinks renderer both reach for browser
// globals at module scope — loading them server-side crashes hydration.
// Force client-only rendering.
const SolanaProviders = dynamic(
  () =>
    import("@/app/components/SolanaProviders").then((m) => ({
      default: m.SolanaProviders,
    })),
  { ssr: false },
);

const BlinkRender = dynamic(
  () =>
    import("@/app/components/BlinkRender").then((m) => ({
      default: m.BlinkRender,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-6 text-sm text-neutral-400">
        Loading the tip card…
      </div>
    ),
  },
);

export function TipClient({
  url,
  rpcUrl,
}: {
  url: string;
  rpcUrl: string;
}) {
  return (
    <SolanaProviders rpcUrl={rpcUrl}>
      <BlinkRender url={url} rpcUrl={rpcUrl} />
    </SolanaProviders>
  );
}
