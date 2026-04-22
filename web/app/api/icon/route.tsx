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
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
        }}
      >
        <BlinkLogo scale={1} />
      </div>
    ),
    { width: 512, height: 512 },
  );
}

function BlinkLogo({ scale }: { scale: number }) {
  const letterSize = 180 * scale;
  const dotSize = 40 * scale;
  const archWidth = 70 * scale;
  const archHeight = 26 * scale;
  const archBorder = 12 * scale;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        color: "#ffffff",
        fontFamily: "sans-serif",
        fontSize: letterSize,
        fontWeight: 900,
        letterSpacing: -4 * scale,
        lineHeight: 1,
      }}
    >
      <span>BL</span>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: `0 ${8 * scale}px`,
        }}
      >
        <div
          style={{
            display: "flex",
            width: archWidth,
            height: archHeight,
            borderTop: `${archBorder}px solid #ffffff`,
            borderLeft: `${archBorder}px solid #ffffff`,
            borderRight: `${archBorder}px solid #ffffff`,
            borderTopLeftRadius: 9999,
            borderTopRightRadius: 9999,
          }}
        />
        <div
          style={{
            marginTop: 12 * scale,
            width: dotSize,
            height: dotSize,
            borderRadius: 9999,
            background: "#ffffff",
          }}
        />
      </div>
      <span>NK</span>
    </div>
  );
}
