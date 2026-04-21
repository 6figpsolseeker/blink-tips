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
  const short = valid ? `${recipient.slice(0, 4)}…${recipient.slice(-4)}` : "…";

  return (
    <main className="mx-auto max-w-xl px-6 py-24">
      <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {valid ? <>Subscribe to {short}</> : <>Invalid pubkey</>}
        </h1>
        {valid ? (
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">
            This URL unfurls as a Blink in supported clients. If you&apos;re
            seeing this raw page, paste the URL into X, Dialect, or a wallet
            with Actions support to render the interactive card.
          </p>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">
            The recipient path segment is not a valid Solana pubkey.
          </p>
        )}
        <div className="mt-6 text-xs text-neutral-500">
          <a href="/" className="underline hover:text-neutral-200">
            ← blink-tips
          </a>
        </div>
      </div>
    </main>
  );
}
