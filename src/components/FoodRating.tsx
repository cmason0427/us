"use client";

import { useState } from "react";
import { useLive } from "@/lib/useLive";
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

export interface FoodNote {
  id: string;
  kind: "meal" | "place";
  ref_id: string;
  author: string;
  text: string;
  created_at: string;
}
export function useFoodNotes() {
  const { data = [] } = useLive<FoodNote[]>(
    "food_notes",
    async () => {
      const { data, error } = await supabaseBrowser().from("food_notes").select("*").order("created_at");
      if (error) throw error;
      return data as FoodNote[];
    },
    ["food_notes"],
  );
  return data;
}

/** What we think of this meal / place, from either of you (lunch notes can be saved here too). */
export function FoodNotes({ kind, id }: { kind: "meal" | "place"; id: string }) {
  const { meId, nameOf, toast } = useApp();
  const notes = useFoodNotes().filter((n) => n.kind === kind && n.ref_id === id);
  const [draft, setDraft] = useState("");
  return (
    <div className="field">
      <span>What we think</span>
      {notes.length > 0 && (
        <div className="note-thread">
          {notes.map((n) => (
            <div key={n.id} className="note-line">
              <strong className="small">{n.author === meId ? "you" : nameOf(n.author)}</strong>
              <span className="grow">{n.text}</span>
              <button
                className="lt-x"
                aria-label="Remove note"
                onClick={async () => {
                  await supabaseBrowser().from("food_notes").delete().eq("id", n.id);
                  refreshAll();
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <form
        className="quick-add"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          const { error } = await supabaseBrowser().from("food_notes").insert({ kind, ref_id: id, author: meId, text: draft.trim() });
          if (error) return toast(error.message);
          setDraft("");
          refreshAll();
        }}
      >
        <input className="input input-sm grow" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="more sauce next time…" aria-label="Note" />
        <button className="btn btn-sm" disabled={!draft.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}
