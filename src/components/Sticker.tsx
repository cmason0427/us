import Image from "next/image";

/** Kodo & Wiley photo stickers (public/stickers, white sticker border kept). Never used in Spicy. */
export type StickerName =
  | "kodo_face"
  | "wiley_face"
  | "duo_faces"
  | "wiley_sniff"
  | "kodo_walk"
  | "wiley_walk"
  | "duo_mountains"
  | "wiley_down"
  | "kodo_sleep"
  | "duo_cuddle"
  | "wiley_trot"
  | "kodo_trot"
  | "wiley_back"
  | "kodo_back"
  | "duo_side";

/** A sticker as an art accent: bigger than an icon so the detail shows, with a tiny tilt. */
export function Sticker({ name, size = 88, tilt = 0, className = "", style }: { name: StickerName; size?: number; tilt?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <Image
      src={`/stickers/${name}.webp`}
      width={size}
      height={size}
      alt=""
      aria-hidden
      className={`sticker-img ${className}`}
      style={{ rotate: tilt ? `${tilt}deg` : undefined, ...style }}
    />
  );
}
