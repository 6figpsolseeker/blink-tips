import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          backgroundImage:
            "radial-gradient(circle at center, #2d1b69 0%, transparent 70%)",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 260,
            fontWeight: 900,
            letterSpacing: -14,
            lineHeight: 1,
          }}
        >
          bt
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 44,
            fontFamily: "monospace",
            color: "#a1a1a1",
            marginTop: -8,
          }}
        >
          blink-tips
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
