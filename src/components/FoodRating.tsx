"use client";

import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import { useFoodRatings } from "@/lib/foodData";
import { useApp } from "./AppProvider";

const face = (n: number) => (n >= 9 ? "😍" : n >= 7 ? "😋" : n >= 5 ? "🙂" : n >= 3 ? "😐" : "🙅");

/** Each of you scores it 1-10, so planning meals isn't guesswork. Tap your number again to clear it. */
export function FoodRating({ kind, id }: { kind: "place" | "meal"; id: string }) {
  const { meId, profiles, toast } = useApp();
  const ratings = useFoodRatings().get(`${kind}:${id}`) ?? [];
  const people = [...profiles].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : 0));

  async function rate(n: number) {
    const supabase = supabaseBrowser();
    const cur = ratings.find((r) => r.user_id === meId)?.score;
    const { error } =
      cur === n
        ? await supabase.from("food_ratings").delete().eq("kind", kind).eq("ref_id", id).eq("user_id", meId)
        : await supabase.from("food_ratings").upsert({ kind, ref_id: id, user_id: meId, score: n, updated_at: new Date().toISOString() });
    if (error) toast(error.message);
    refreshAll();
  }

  return (
    <div className="food-rating">
      {people.map((p) => {
        const score = ratings.find((r) => r.user_id === p.id)?.score;
        const isMe = p.id === meId;
        return (
          <div key={p.id} className="food-rating-row">
            <span className="small muted food-rating-who">{isMe ? "Me" : p.display_name}</span>
            {isMe ? (
              <div className="score-row" role="group" aria-label="Your score">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" aria-pressed={score != null && n <= score} className={score === n ? "on" : ""} onClick={() => rate(n)} aria-label={`${n} out of 10`}>
                    {n}
                  </button>
                ))}
              </div>
            ) : (
              <span className="small">{score ? `${face(score)} ${score}/10` : <span className="faint">not rated</span>}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Tiny "C 8 · P 6" for list cards. */
export function RatingBadge({ kind, id }: { kind: "place" | "meal"; id: string }) {
  const { profiles } = useApp();
  const ratings = useFoodRatings().get(`${kind}:${id}`) ?? [];
  if (!ratings.length) return null;
  return (
    <span className="rating-badge">
      {ratings.map((r) => (
        <span key={r.user_id}>
          {(profiles.find((p) => p.id === r.user_id)?.display_name ?? "?").slice(0, 1).toUpperCase()} {r.score}
        </span>
      ))}
    </span>
  );
}
