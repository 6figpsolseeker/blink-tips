import { PublicKey } from "@solana/web3.js";
import { TipClient } from "./TipClient";

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
  const actionUrl = `/api/actions/subscribe/${recipient}`;

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      {valid ? (
        <>
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">
            Tip {short}
          </h1>
          <TipClient url={actionUrl} />
          <div className="mt-6 text-xs text-neutral-500">
            <a href="/" className="underline hover:text-neutral-200">
              ← blink-tips
            </a>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Invalid pubkey
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">
            The recipient path segment is not a valid Solana pubkey.
          </p>
          <div className="mt-6 text-xs text-neutral-500">
            <a href="/" className="underline hover:text-neutral-200">
              ← blink-tips
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
