import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "BLiNK — recurring tips on Solana, one link";

export default function OGImage() {
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
          padding: "60px",
          backgroundColor: "#0a0a0a",
          backgroundImage:
            "radial-gradient(circle at 50% 30%, rgba(156,175,136,0.22) 0%, transparent 60%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <Wordmark />
        <div
          style={{
            marginTop: 40,
            fontSize: 30,
            color: "#a1a1a1",
            maxWidth: 900,
            textAlign: "center",
          }}
        >
          Recurring tips on Solana — streamed per slot, one link to share.
        </div>
      </div>
    ),
    size,
  );
}

function Wordmark() {
  const letterSize = 220;
  const dotSize = 48;
  const archWidth = 84;
  const archHeight = 30;
  const archBorder = 14;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        color: "#ffffff",
        fontSize: letterSize,
        fontWeight: 900,
        letterSpacing: -5,
        lineHeight: 1,
      }}
    >
      <span>BL</span>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "0 10px",
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
            marginTop: 14,
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
