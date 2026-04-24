"use client";

import dynamic from "next/dynamic";

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

// Providers live in the root layout now — no nesting needed here.
export function TipClient({ url }: { url: string }) {
  return <CustomBlinkCard url={url} />;
}
