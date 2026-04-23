"use client";

import dynamic from "next/dynamic";

// Client-only because InboxClient uses wallet hooks + window. Providers are
// already wrapped at the root layout; no need to re-wrap here.
const InboxClient = dynamic(
  () => import("./InboxClient").then((m) => ({ default: m.InboxClient })),
  { ssr: false },
);

export function InboxWrapper() {
  return <InboxClient />;
}
