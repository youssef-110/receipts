import { useId } from "react";

export const BRAND = "Patina";

/**
 * Growth rings in a cross-section: history laid down year by year, which a website cannot fake.
 * The rings are eccentric, like real wood, so the mark never reads as a target. Same geometry as app/icon.svg.
 */
const DISC = { cx: 16, cy: 16, r: 13 };
const RINGS = [
  { cx: 14.8, cy: 17.2, r: 8.6 },
  { cx: 13.6, cy: 18.2, r: 4.4 },
];
const RING_WIDTH = 1.7;

export function LogoMark({ className = "size-6" }: { className?: string }) {
  const id = `pm${useId().replace(/[^\w-]/g, "")}`; // useId may contain ':' or '«', which break url(#…)
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
        <rect width="32" height="32" fill="#fff" />
        {RINGS.map((c) => (
          <circle key={c.r} {...c} fill="none" stroke="#000" strokeWidth={RING_WIDTH} />
        ))}
      </mask>
      <circle {...DISC} fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}

/** Mask-free variant for next/og images, where the background colour is known: rings are painted in `cut`. */
export function StaticMark({ size, fill, cut }: { size: number; fill: string; cut: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <circle {...DISC} fill={fill} />
      {RINGS.map((c) => (
        <circle key={c.r} {...c} fill="none" stroke={cut} strokeWidth={RING_WIDTH} />
      ))}
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark className="size-[22px] text-ink" />
      <span className="font-serif text-[22px] font-medium leading-none tracking-[-0.025em]">{BRAND}</span>
    </span>
  );
}
