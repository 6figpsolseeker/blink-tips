export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "4rem auto", padding: "0 1.5rem", lineHeight: 1.6 }}>
      <h1>blink-tips</h1>
      <p>
        Recurring tip vaults on Solana, shareable as Blinks. Paste
        <code> https://&lt;this-host&gt;/tip/&lt;recipient-pubkey&gt; </code>
        into any Blinks-aware client (X, Dialect, compatible wallets) to render
        a one-click subscribe card.
      </p>
      <h2>Endpoints</h2>
      <ul>
        <li>
          <code>GET /api/actions/subscribe/[recipient]</code> — open a vault
        </li>
        <li>
          <code>GET /api/actions/claim/[tipper]/[recipient]</code> — claim
          vested tips
        </li>
      </ul>
    </main>
  );
}
