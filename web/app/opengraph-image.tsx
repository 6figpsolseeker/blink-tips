import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "blink-tips — recurring tips on Solana, one link";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#0a0a0a",
          backgroundImage:
            "radial-gradient(circle at 20% 0%, rgba(153,69,255,0.35) 0%, transparent 55%)",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 48,
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              background: "#9945FF",
            }}
          />
          <div
            style={{
              fontSize: 32,
              fontFamily: "monospace",
              color: "#d4d4d4",
            }}
          >
            blink-tips
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 88,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -2,
          }}
        >
          <span>Recurring tips on Solana.</span>
          <span style={{ color: "#6b7280" }}>One link.</span>
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 28,
            color: "#a1a1a1",
            maxWidth: 900,
          }}
        >
          Share a Blink. One click opens a vault that streams SOL per slot — no
          keepers, no middlemen.
        </div>
      </div>
    ),
    size,
  );
}
