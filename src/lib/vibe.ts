export const VIBES = [
  { v: "great", label: "✨ Great" },
  { v: "good", label: "🙂 Good" },
  { v: "meh", label: "😐 Meh" },
  { v: "tired", label: "😮‍💨 Tired" },
  { v: "low", label: "😔 Low" },
  { v: "stressed", label: "😣 Stressed" },
  { v: "hug", label: "🫂 Need a hug" },
  { v: "space", label: "🔇 Need space" },
];
export const vibeLabel = (v: string | null) => VIBES.find((x) => x.v === v)?.label ?? null;
/** "🙂 Good, 😮‍💨 Tired" for however many they picked. */
export const vibeLabels = (vs: string[]) => vs.map(vibeLabel).filter(Boolean).join(", ");

export interface VibeCheck {
  id: string;
  from_user: string;
  to_user: string;
  /** Old single pick (kept for early answers); new answers use `choices`. */
  choice: string | null;
  choices: string[];
  answer: string | null;
  answered_at: string | null;
  created_at: string;
}
