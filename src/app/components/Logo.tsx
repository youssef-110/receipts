import { useId } from "react";

/** Receipt silhouette, torn bottom edge, verified tick cut out of it. Same geometry as app/icon.svg. */
export const RECEIPT_PATH =
  "M8 3h16a3 3 0 0 1 3 3v22.5l-3.67-2.25-3.66 2.25L16 26.25l-3.67 2.25-3.66-2.25L5 28.5V6a3 3 0 0 1 3-3z";
export const TICK_PATH = "M10.5 15.25l3.75 3.75 7.25-7.5";

export function LogoMark({ className = "size-6" }: { className?: string }) {
  const id = `rm${useId().replace(/[^\w-]/g, "")}`; // useId may contain ':' or '«', which break url(#…)
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
        <rect width="32" height="32" fill="#fff" />
        <path d={TICK_PATH} fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </mask>
      <path d={RECEIPT_PATH} fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}

/** Mask-free variant for next/og images, where the background colour is known: the tick is painted in `cut`. */
export function StaticMark({ size, fill, cut }: { size: number; fill: string; cut: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d={RECEIPT_PATH} fill={fill} />
      <path d={TICK_PATH} fill="none" stroke={cut} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark className="size-[22px] text-accent" />
      <span className="text-[17px] font-semibold tracking-[-0.025em]">Receipts</span>
    </span>
  );
}
