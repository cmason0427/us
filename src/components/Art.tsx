// Hand-drawn-ish SVG motifs + UI icons. Kept inline so there's no icon font
// or image request, and they inherit `currentColor` where it makes sense.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/* ─── Motifs (the dog illustrations live in public/art; see DogPic) ──────── */

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
export const IconBookmark = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.5-6.5 4.5v-16a1 1 0 0 1 1-1z" /></svg>
);
export const IconKey = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><circle cx="8" cy="15" r="4" /><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2" /></svg>
);
export const IconHeart = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
);
export const IconWallet = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="4" y="8" width="16" height="11" rx="2.5" /><circle cx="16" cy="13.5" r="1.2" /></svg>
);
export const IconFork = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v6" /><path d="M17 21V3c-2 1-3.5 3.5-3.5 7v3H17" /></svg>
);
export const IconGear = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}>
    <path d="M10.3 2.8h3.4l.5 2.4 1.7.9 2.3-.9 1.7 2.9-1.8 1.6v2l1.8 1.6-1.7 2.9-2.3-.9-1.7.9-.5 2.4h-3.4l-.5-2.4-1.7-.9-2.3.9-1.7-2.9 1.8-1.6v-2L4.1 8.1l1.7-2.9 2.3.9 1.7-.9z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);
export const IconPiggy = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}>
    <path d="M4.5 12.5c0-3.6 3.4-6 7.5-6 1.3 0 2.5.2 3.6.7l2.4-1.4v3.1c.9.8 1.5 1.8 1.8 2.9H21v3.4h-1.5c-.5 1-1.3 1.8-2.3 2.4V20h-2.7v-1.6c-.8.2-1.6.3-2.5.3s-1.7-.1-2.5-.3V20H6.8v-2.3c-1.4-1.3-2.3-3-2.3-5.2z" />
    <path d="M10 6.9c.2-1.4 1.4-2.4 2.8-2.4s2.6 1 2.8 2.4" />
    <circle cx="16" cy="11" r="0.6" fill="currentColor" />
  </svg>
);
export const IconDice = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}>
    <path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4z" />
    <path d="M4 7.4 12 12l8-4.6M12 12v9.2" />
  </svg>
);
export const IconLeaf = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}>
    <path d="M12 21v-7" />
    <path d="M12 14c-1.5-3.5-1.5-7.5 0-11 1.5 3.5 1.5 7.5 0 11z" />
    <path d="M12 14c-2.4-1.4-5.8-1.6-8.5-.3 2 2.2 5.6 2.6 8.5.3zM12 14c2.4-1.4 5.8-1.6 8.5-.3-2 2.2-5.6 2.6-8.5.3z" />
    <path d="M12 12.5c-2.6-2.2-4.2-5.4-4.3-8.6 2.4 1.6 3.9 4.9 4.3 8.6zM12 12.5c2.6-2.2 4.2-5.4 4.3-8.6-2.4 1.6-3.9 4.9-4.3 8.6z" />
  </svg>
);
export const IconBag = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M5 8h14l-1 12.5H6L5 8z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></svg>
);
export const IconPaw = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><ellipse cx="12" cy="16" rx="4" ry="3.3" /><circle cx="6.5" cy="11" r="1.7" /><circle cx="9.7" cy="7" r="1.7" /><circle cx="14.3" cy="7" r="1.7" /><circle cx="17.5" cy="11" r="1.7" /></svg>
);
export const IconFlame = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.3-5.4 3.6-7.8.5 1.9 1.5 3 2.6 3.3C11.4 7.2 12.6 4.6 15 3c-.3 3 1.5 4.6 2.6 6.4.7 1.2.9 2.4.9 3.6 0 4.3-2.6 8-6.5 8z" /></svg>
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
