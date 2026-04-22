import Link from "next/link";
import { BlinkGenerator } from "./components/BlinkGenerator";

const GITHUB_URL = "https://github.com/6figpsolseeker/blink-tips";

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-6 pb-32">
        <Hero />
        <HowItWorks />
        <Generate />
        <UnderTheHood />
      </main>
      <Footer />
    </>
  );
}

function Header() {
  return (
    <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-accent" />
        <span className="font-mono text-sm tracking-tight text-neutral-200">
          blink-tips
        </span>
      </div>
      <nav className="flex items-center gap-5 text-sm text-neutral-400">
        <a href="#how" className="hover:text-neutral-100">
          How it works
        </a>
        <a href="#generate" className="hover:text-neutral-100">
          Generate
        </a>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="pt-16 pb-24">
      <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 text-xs text-neutral-400">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        Live on devnet · MIT licensed
      </div>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
        Recurring tips on Solana.
        <br />
        <span className="text-neutral-500">One link.</span>
      </h1>
      <p className="mt-6 max-w-xl text-base leading-relaxed text-neutral-400">
        Share a Blink. One click opens a vault that streams SOL to you per
        slot. No keeper bots. No subscriptions. No middleman — a ~150-line
        Anchor program and the recipient claims whenever they want.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <a
          href="#generate"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-muted"
        >
          Generate your Blink
        </a>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 transition hover:border-neutral-700 hover:text-white"
        >
          View source
        </a>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps: Array<{ n: string; title: string; body: string }> = [
    {
      n: "01",
      title: "Deposit",
      body: "Tipper signs one tx that opens a PDA-derived vault, locks in a per-slot vesting rate, and deposits SOL.",
    },
    {
      n: "02",
      title: "Stream",
      body: "Every Solana slot (~400 ms), more lamports vest. Empty-vault periods don't accrue back-pay.",
    },
    {
      n: "03",
      title: "Claim",
      body: "Recipient (or anyone cranking on their behalf) calls claim. The program pays out whatever has vested.",
    },
  ];
  return (
    <section id="how" className="border-t border-neutral-900 py-16">
      <h2 className="text-sm font-medium uppercase tracking-widest text-neutral-500">
        How it works
      </h2>
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {steps.map((s) => (
          <div
            key={s.n}
            className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-5"
          >
            <div className="font-mono text-xs text-accent">{s.n}</div>
            <div className="mt-3 font-medium text-neutral-100">{s.title}</div>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              {s.body}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm leading-relaxed text-neutral-500">
        Why pull, not push? Solana has no native scheduler and Clockwork shut
        down in 2024. Keeper bots add centralization and liveness risk. Pull
        means zero off-chain infrastructure and gas is paid by the party who
        cares.
      </p>
    </section>
  );
}

function Generate() {
  return (
    <section id="generate" className="border-t border-neutral-900 py-16">
      <h2 className="text-sm font-medium uppercase tracking-widest text-neutral-500">
        Generate your Blink
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-400">
        Paste the Solana pubkey you want tips sent to. The URL below renders
        as an inline &quot;subscribe&quot; card in any Blinks-aware client.
      </p>
      <div className="mt-8">
        <BlinkGenerator />
      </div>
    </section>
  );
}

function UnderTheHood() {
  const snippet = `GET /api/actions/subscribe/<pubkey>

{
  "type": "action",
  "icon": "https://.../tip-icon.png",
  "title": "Tip 4Nd1…pump",
  "description": "Open a recurring tip vault...",
  "links": {
    "actions": [
      { "label": "0.1 SOL / 7 days", "href": "...?amount=0.1&days=7" },
      { "label": "0.5 SOL / 30 days", "href": "...?amount=0.5&days=30" },
      { "label": "Custom", "href": "...?amount={amount}&days={days}" }
    ]
  }
}`;
  return (
    <section className="border-t border-neutral-900 py-16">
      <h2 className="text-sm font-medium uppercase tracking-widest text-neutral-500">
        Under the hood
      </h2>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="font-medium text-neutral-100">
            Solana Actions, JSON in
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-neutral-400">
            The subscribe endpoint returns a standard Actions payload. Blink
            clients render the card inline, POST back the tipper&apos;s pubkey,
            and get an unsigned transaction to sign.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            <Link
              href="/api/actions/subscribe/So11111111111111111111111111111111111111112"
              className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-neutral-300 hover:border-neutral-700 hover:text-white"
            >
              Try GET /api/actions/subscribe
            </Link>
            <a
              href={`${GITHUB_URL}/blob/main/programs/tip-vault/src/lib.rs`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-neutral-300 hover:border-neutral-700 hover:text-white"
            >
              Read the Anchor program
            </a>
          </div>
        </div>
        <pre className="overflow-x-auto rounded-xl border border-neutral-900 bg-black/50 p-4 text-[11px] leading-relaxed text-neutral-300">
          <code className="font-mono">{snippet}</code>
        </pre>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-neutral-900">
      <div className="mx-auto flex max-w-3xl flex-col items-start justify-between gap-3 px-6 py-8 text-xs text-neutral-500 sm:flex-row sm:items-center">
        <div>MIT licensed · devnet only · not audited</div>
        <div className="flex items-center gap-4">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-neutral-200"
          >
            GitHub
          </a>
          <a
            href="https://docs.dialect.to/documentation/actions"
            target="_blank"
            rel="noreferrer"
            className="hover:text-neutral-200"
          >
            Blinks docs
          </a>
        </div>
      </div>
    </footer>
  );
}
