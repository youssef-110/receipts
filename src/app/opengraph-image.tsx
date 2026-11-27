import { ImageResponse } from "next/og";
import { StaticMark } from "./components/Logo";

export const alt = "Receipts: websites are free to fake. History isn't.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#f7f6f2",
          color: "#1c1b18",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <StaticMark size={56} fill="#3445c2" cut="#f7f6f2" />
          <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em" }}>Receipts</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, lineHeight: 1.04, letterSpacing: "-0.035em", fontWeight: 600 }}>Websites are free to fake.</div>
          <div style={{ fontSize: 84, lineHeight: 1.04, letterSpacing: "-0.035em", fontWeight: 600, color: "#67655e" }}>History isn&apos;t.</div>
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#67655e" }}>Paste a link. Every reason in the verdict links to its proof.</div>
      </div>
    ),
    size,
  );
}
