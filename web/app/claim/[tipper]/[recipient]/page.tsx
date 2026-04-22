import { PublicKey } from "@solana/web3.js";
import { ClaimClient } from "./ClaimClient";

type Props = { params: Promise<{ tipper: string; recipient: string }> };

function resolveRpcUrl(): string {
  if (process.env.RPC_URL) return process.env.RPC_URL;
  const network = (process.env.NETWORK ?? "devnet").toLowerCase();
  return network === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
}

function parse(raw: string): PublicKey | null {
  try {
    return new PublicKey(raw);
  } catch {
    return null;
  }
}

export default async function ClaimPage({ params }: Props) {
  const { tipper, recipient } = await params;
  const tipperKey = parse(tipper);
  const recipientKey = parse(recipient);
  const rpcUrl = resolveRpcUrl();
  const actionUrl = `/api/actions/claim/${tipper}/${recipient}`;
  const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      {tipperKey && recipientKey ? (
        <>
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">
            Claim from {short(tipper)}
          </h1>
          <p className="mb-6 text-sm text-neutral-500">
            to {short(recipient)}
          </p>
          <ClaimClient url={actionUrl} rpcUrl={rpcUrl} />
          <p className="mt-4 text-xs text-neutral-500">
            Claim is permissionless — any wallet can crank it and funds still
            flow to the stored recipient.
          </p>
          <div className="mt-6 text-xs text-neutral-500">
            <a href="/" className="underline hover:text-neutral-200">
              ← blink-tips
            </a>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Invalid claim URL
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">
            Expected <code>/claim/&lt;tipper-pubkey&gt;/&lt;recipient-pubkey&gt;</code>.
            One of those segments isn&apos;t a valid Solana pubkey.
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
