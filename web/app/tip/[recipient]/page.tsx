import { PublicKey } from "@solana/web3.js";

type Props = { params: Promise<{ recipient: string }> };

export default async function TipPage({ params }: Props) {
  const { recipient } = await params;
  let valid = true;
  try {
    new PublicKey(recipient);
  } catch {
    valid = false;
  }

  return (
    <main style={{ maxWidth: 640, margin: "4rem auto", padding: "0 1.5rem", lineHeight: 1.6 }}>
      <h1>Subscribe to {valid ? `${recipient.slice(0, 4)}…${recipient.slice(-4)}` : "…"}</h1>
      {valid ? (
        <p>
          This page unfurls as a Blink in supported clients. If you are seeing
          this raw, paste the URL into a Blinks-aware client (X, Dialect, or a
          wallet with Actions support).
        </p>
      ) : (
        <p>Invalid recipient pubkey.</p>
      )}
    </main>
  );
}
