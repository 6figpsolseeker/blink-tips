"use client";

import dynamic from "next/dynamic";

const SolanaProviders = dynamic(
  () =>
    import("@/app/components/SolanaProviders").then((m) => ({
      default: m.SolanaProviders,
    })),
  { ssr: false },
);

const CustomBlinkCard = dynamic(
  () =>
    import("@/app/components/CustomBlinkCard").then((m) => ({
      default: m.CustomBlinkCard,
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
      <CustomBlinkCard url={url} />
    </SolanaProviders>
  );
}
