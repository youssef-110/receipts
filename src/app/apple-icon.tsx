import { ImageResponse } from "next/og";
import { StaticMark } from "./components/Logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
        <StaticMark size={120} fill="#0b0b0c" cut="#ffffff" />
      </div>
    ),
    size,
  );
}
