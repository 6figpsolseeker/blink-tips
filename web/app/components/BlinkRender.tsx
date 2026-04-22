"use client";

import { Blink, useBlink } from "@dialectlabs/blinks";
import { useBlinkSolanaWalletAdapter } from "@dialectlabs/blinks/hooks/solana";
import "@dialectlabs/blinks/index.css";

export function BlinkRender({
  url,
  rpcUrl,
}: {
  url: string;
  rpcUrl: string;
}) {
  const { adapter } = useBlinkSolanaWalletAdapter(rpcUrl);
  const { blink, isLoading } = useBlink({ url });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-6 text-sm text-neutral-400">
        Loading the tip card…
      </div>
    );
  }
  if (!blink) {
    return (
      <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-6 text-sm text-neutral-400">
        Could not load this Blink. Try refreshing.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-2">
      <Blink
        blink={blink}
        adapter={adapter}
        stylePreset="x-dark"
        securityLevel="all"
      />
    </div>
  );
}
