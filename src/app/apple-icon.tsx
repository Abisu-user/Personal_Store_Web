import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(135deg, #6f9ef5 0%, #6572df 52%, #9d7de0 100%)",
      }}
    >
      <div
        style={{
          width: 112,
          height: 124,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          borderRadius: "56px 56px 46px 46px",
          background: "linear-gradient(145deg, #ffffff 0%, #dbe8ff 100%)",
          boxShadow: "0 12px 24px rgba(39, 55, 133, .25)",
        }}
      >
        <div
          style={{
            width: 58,
            height: 52,
            display: "flex",
            position: "relative",
            alignItems: "flex-end",
            justifyContent: "center",
            borderRadius: 10,
            background: "#314d98",
          }}
        >
          <div
            style={{
              width: 34,
              height: 38,
              position: "absolute",
              top: -27,
              border: "10px solid #314d98",
              borderBottom: "0px",
              borderRadius: "22px 22px 0 0",
            }}
          />
          <div style={{ width: 10, height: 19, marginBottom: 12, borderRadius: 8, background: "#dbe8ff" }} />
        </div>
      </div>
      <div style={{ width: 18, height: 18, position: "absolute", top: 31, right: 31, borderRadius: 99, background: "rgba(255,255,255,.78)" }} />
    </div>,
    size,
  );
}
