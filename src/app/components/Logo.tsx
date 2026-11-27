import { useId } from "react";

/** Receipt slip: torn bottom edge, one ruled "total" line cut out. Same geometry as app/icon.svg. */
export const RECEIPT_PATH = "M9.5 3h13a2.5 2.5 0 0 1 2.5 2.5V29l-3-2.5-3 2.5-3-2.5-3 2.5-3-2.5-3 2.5V5.5A2.5 2.5 0 0 1 9.5 3z";
export const RULE_PATH = "M11.5 19.5h9";

export function LogoMark({ className = "size-6" }: { className?: string }) {
  const id = `rm${useId().replace(/[^\w-]/g, "")}`; // useId may contain ':' or '«', which break url(#…)
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
        <rect width="32" height="32" fill="#fff" />
        <path d={RULE_PATH} stroke="#000" strokeWidth="2.25" strokeLinecap="round" />
      </mask>
      <path d={RECEIPT_PATH} fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}

/** Mask-free variant for next/og images, where the background colour is known: the rule is painted in `cut`. */
export function StaticMark({ size, fill, cut }: { size: number; fill: string; cut: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d={RECEIPT_PATH} fill={fill} />
      <path d={RULE_PATH} stroke={cut} strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-1.5">
      <LogoMark className="size-[22px] text-ink" />
      <span className="font-serif text-[21px] font-medium leading-none tracking-[-0.02em]">Receipts</span>
    </span>
  );
}
