import Image from "next/image";

/** Charlie's Kodo & Wiley artwork, in public/art (square PNGs, transparent). */
export type ArtName = "bone" | "food_bowl" | "heart_red" | "kodo_back" | "kodo_back_arrow" | "kodo_back_circle" | "kodo_curled" | "kodo_down" | "kodo_face" | "kodo_face_alt" | "kodo_happy" | "kodo_paw" | "kodo_run" | "kodo_standing" | "kodo_walk" | "kodo_wiley_back_walk" | "kodo_wiley_cuddle" | "kodo_wiley_face" | "kodo_wiley_standing" | "leash" | "moon_night" | "mountain" | "sun" | "tennis_ball" | "trees" | "water" | "wiley_back" | "wiley_back_circle" | "wiley_curled" | "wiley_down" | "wiley_face" | "wiley_happy" | "wiley_jump" | "wiley_jump_back" | "wiley_paw" | "wiley_run" | "wiley_standing" | "wiley_walk";

/** One of the dog illustrations at a given size (square). Decorative unless `alt` is set. */
export function DogPic({ name, size = 48, alt = "", className, style }: { name: ArtName; size?: number; alt?: string; className?: string; style?: React.CSSProperties }) {
  return <Image src={`/art/${name}.png`} width={size} height={size} alt={alt} aria-hidden={alt ? undefined : true} className={className} style={style} />;
}
