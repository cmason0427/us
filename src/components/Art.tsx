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
export const IconFork = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v6" /><path d="M17 21V3c-2 1-3.5 3.5-3.5 7v3H17" /></svg>
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
