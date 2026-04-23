import { InboxWrapper } from "./InboxWrapper";

export const metadata = {
  title: "Inbox · blink-tips",
};

export default function InboxPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Your active tip vaults and any messages sent with them. Click Claim to
        pull whatever has vested.
      </p>
      <div className="mt-8">
        <InboxWrapper />
      </div>
      <div className="mt-8 text-xs text-neutral-500">
        <a href="/" className="underline hover:text-neutral-200">
          ← blink-tips
        </a>
      </div>
    </main>
  );
}
