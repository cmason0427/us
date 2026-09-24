// Hand-drawn-ish SVG motifs + UI icons. Kept inline so there's no icon font
// or image request, and they inherit `currentColor` where it makes sense.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/* ─── Motifs ─────────────────────────────────────────────────────────────── */

/**
 * Placeholder for Charlie's dog artwork (it replaces the old mushroom). When the
 * real designs arrive, drop them in public/art/ and render them here; every
 * spot that shows dog art goes through this one component.
 */
export function DogArt(props: P) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden {...props}>
      <circle cx="32" cy="32" r="29" fill="var(--butter)" stroke="var(--plum)" strokeWidth="2" />
      <ellipse cx="32" cy="40" rx="10" ry="8" fill="var(--plum)" />
      <circle cx="20" cy="28" r="4.5" fill="var(--plum)" />
      <circle cx="27" cy="20" r="4.5" fill="var(--plum)" />
      <circle cx="37" cy="20" r="4.5" fill="var(--plum)" />
      <circle cx="44" cy="28" r="4.5" fill="var(--plum)" />
    </svg>
  );
}

export function Flower(props: P & { petal?: string }) {
  const { petal = "var(--rose)", ...rest } = props;
  return (
    <svg viewBox="0 0 64 64" aria-hidden {...rest}>
      <path d="M32 40c0 8-1 14-3 20" stroke="var(--sage)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M30 52c-6-1-10-5-11-9 5 0 9 3 11 9z" fill="var(--sage)" stroke="var(--plum)" strokeWidth="2" strokeLinejoin="round" />
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="32" cy="16" rx="8" ry="11" fill={petal} stroke="var(--plum)" strokeWidth="2" transform={`rotate(${a} 32 28)`} />
      ))}
      <circle cx="32" cy="28" r="6.5" fill="var(--butter)" stroke="var(--plum)" strokeWidth="2" />
    </svg>
  );
}

export function Paw(props: P) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden {...props}>
      <g fill="currentColor">
        <ellipse cx="32" cy="42" rx="13" ry="11" />
        <ellipse cx="15" cy="27" rx="6" ry="8" transform="rotate(-18 15 27)" />
        <ellipse cx="26" cy="16" rx="6" ry="8.5" transform="rotate(-6 26 16)" />
        <ellipse cx="39" cy="16" rx="6" ry="8.5" transform="rotate(6 39 16)" />
        <ellipse cx="50" cy="27" rx="6" ry="8" transform="rotate(18 50 27)" />
      </g>
    </svg>
  );
}

export function Sprig(props: P) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden {...props}>
      <path d="M12 56C24 40 34 26 52 8" stroke="var(--plum)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {[
        [22, 42, -30],
        [30, 32, -30],
        [38, 23, -30],
        [46, 15, -30],
      ].map(([x, y, r], i) => (
        <g key={i}>
          <ellipse cx={x - 6} cy={y - 3} rx="7" ry="3.6" fill="var(--sage)" stroke="var(--plum)" strokeWidth="1.8" transform={`rotate(${r - 20} ${x - 6} ${y - 3})`} />
          <ellipse cx={x + 3} cy={y + 5} rx="7" ry="3.6" fill="var(--sage)" stroke="var(--plum)" strokeWidth="1.8" transform={`rotate(${r + 70} ${x + 3} ${y + 5})`} />
        </g>
      ))}
    </svg>
  );
}

export function Teapot(props: P) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden {...props}>
      <path d="M14 30c0-8 8-13 18-13s18 5 18 13v8c0 8-8 14-18 14s-18-6-18-14z" fill="var(--butter)" stroke="var(--plum)" strokeWidth="2.5" />
      <path d="M50 30c6 0 8 4 6 8s-6 5-6 5" fill="none" stroke="var(--plum)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M14 32c-5-3-10 0-10 4l4 6 6-2" fill="var(--butter)" stroke="var(--plum)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M25 17c0-4 3-6 7-6s7 2 7 6" fill="var(--terracotta)" stroke="var(--plum)" strokeWidth="2.5" />
      <circle cx="32" cy="9" r="2.5" fill="var(--plum)" />
      <path d="M22 36c3 3 7 3 10 0s7-3 10 0" fill="none" stroke="var(--terracotta)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** A quiet section rule. (Name kept from the old wavy divider.) */
export function Wavy({ className = "" }: { className?: string }) {
  return <hr className={`wavy ${className}`} />;
}

/* ─── UI icons ───────────────────────────────────────────────────────────── */

export const IconHome = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" /></svg>
);
export const IconCalendar = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><rect x="4" y="5.5" width="16" height="14.5" rx="3" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /><circle cx="9" cy="14.5" r=".6" fill="currentColor" /><circle cx="15" cy="14.5" r=".6" fill="currentColor" /></svg>
);
export const IconSparkle = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M12 3.5c.6 4 2.3 6.2 6.5 7-4.2.8-5.9 3-6.5 7-.6-4-2.3-6.2-6.5-7 4.2-.8 5.9-3 6.5-7z" /><path d="M19 3v3M17.5 4.5h3" /></svg>
);
export const IconList = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M9.5 7H20M9.5 12H20M9.5 17H20" /><path d="m4 7 1 1 2-2M4 12l1 1 2-2M4 17l1 1 2-2" /></svg>
);
export const IconPlus = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} strokeWidth={3} {...p}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconX = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2.5} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconChevron = ({ dir = "right", ...p }: P & { dir?: "left" | "right" }) => (
  <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2.5} {...p}><path d={dir === "right" ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} /></svg>
);
export const IconTrash = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg>
);
export const IconCamera = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
export const IconPin = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M12 21s-6-5.3-6-10.5a6 6 0 0 1 12 0C18 15.7 12 21 12 21z" /><circle cx="12" cy="10.5" r="2" /></svg>
);
export const IconBell = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
);
export const IconEdit = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M5 19h3.5L19 8.5 15.5 5 5 15.5z" /></svg>
);
