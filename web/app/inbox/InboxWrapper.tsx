"use client";

import dynamic from "next/dynamic";

const Providers = dynamic(
  () =>
    import("@/app/components/SolanaProviders").then((m) => ({
      default: m.SolanaProviders,
    })),
  { ssr: false },
);
const InboxClient = dynamic(
  () => import("./InboxClient").then((m) => ({ default: m.InboxClient })),
  { ssr: false },
);

export function InboxWrapper({ rpcUrl }: { rpcUrl: string }) {
  return (
    <Providers rpcUrl={rpcUrl}>
      <InboxClient />
    </Providers>
  );
}
