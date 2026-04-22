import { ImageResponse } from "next/og";

// Favicon — just the winking-eye glyph (arc over dot), no text: the full
// BLiNK wordmark doesn't fit legibly at 32×32.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 6,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 16,
              height: 6,
              borderTop: "3px solid #ffffff",
              borderLeft: "3px solid #ffffff",
              borderRight: "3px solid #ffffff",
              borderTopLeftRadius: 999,
              borderTopRightRadius: 999,
            }}
          />
          <div
            style={{
              marginTop: 3,
              width: 7,
              height: 7,
              borderRadius: 999,
              background: "#ffffff",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
