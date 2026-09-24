export const STAR_COLORS = [
  { v: "pink", label: "Pink", hex: "#e58fa7" },
  { v: "gold", label: "Gold", hex: "#e3b341" },
  { v: "green", label: "Green", hex: "#6fa56a" },
  { v: "blue", label: "Blue", hex: "#6a9ed0" },
  { v: "purple", label: "Purple", hex: "#9a7bd0" },
  { v: "red", label: "Red", hex: "#d4574e" },
];
export const starColor = (v: string | null) => STAR_COLORS.find((c) => c.v === v) ?? STAR_COLORS[1];
