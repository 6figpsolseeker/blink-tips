import { InboxWrapper } from "./InboxWrapper";

function resolveRpcUrl(): string {
  if (process.env.RPC_URL) return process.env.RPC_URL;
  const network = (process.env.NETWORK ?? "devnet").toLowerCase();
  return network === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
}

export const metadata = {
  title: "Inbox · blink-tips",
};

export default function InboxPage() {
  const rpcUrl = resolveRpcUrl();
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Messages sent with tips to your wallet.
      </p>
      <div className="mt-8">
        <InboxWrapper rpcUrl={rpcUrl} />
      </div>
      <div className="mt-8 text-xs text-neutral-500">
        <a href="/" className="underline hover:text-neutral-200">
          ← blink-tips
        </a>
      </div>
    </main>
  );
}
