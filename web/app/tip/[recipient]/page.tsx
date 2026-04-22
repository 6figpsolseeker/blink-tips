import { PublicKey } from "@solana/web3.js";
import { BlinkRender } from "@/app/components/BlinkRender";
import { SolanaProviders } from "@/app/components/SolanaProviders";

type Props = { params: Promise<{ recipient: string }> };

function resolveRpcUrl(): string {
  if (process.env.RPC_URL) return process.env.RPC_URL;
  const network = (process.env.NETWORK ?? "devnet").toLowerCase();
  return network === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
}

export default async function TipPage({ params }: Props) {
  const { recipient } = await params;
  let valid = true;
  try {
    new PublicKey(recipient);
  } catch {
    valid = false;
  }
  const short = valid ? `${recipient.slice(0, 4)}…${recipient.slice(-4)}` : "…";
  const rpcUrl = resolveRpcUrl();
  const actionUrl = `/api/actions/subscribe/${recipient}`;

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      {valid ? (
        <>
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">
            Tip {short}
          </h1>
          <SolanaProviders rpcUrl={rpcUrl}>
            <BlinkRender url={actionUrl} rpcUrl={rpcUrl} />
          </SolanaProviders>
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
