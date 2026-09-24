"use client";

import { useState } from "react";
import { format, subHours } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useNow } from "@/lib/dates";
import { useApp } from "./AppProvider";

interface Night {
  user_id: string;
  house_of: string | null;
  custom: string | null;
}

/** "Tonight" rolls over at 5am, so checking at 1am still shows last night's answer. */
const nightOf = (d: Date) => format(subHours(d, 5), "yyyy-MM-dd");

/** Where each of you is sleeping tonight. You set yours; theirs is read-only. */
export function useSleepTonight() {
  const now = useNow();
  const night = now ? nightOf(now) : "";
  const { meId, partner, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const { data: rows = [] } = useLive<Night[]>(
    `sleep:${night}`,
    async () => {
      if (!night) return [];
      const { data, error } = await supabase.from("sleep_nights").select("user_id, house_of, custom").eq("night", night);
      if (error) throw error;
      return data as Night[];
    },
    ["sleep_nights"],
  );
  const mine = rows.find((r) => r.user_id === meId);
  const theirs = partner ? rows.find((r) => r.user_id === partner.id) : undefined;
  /** Short, with an icon, from the viewer's side. Unset reads "not sure yet". */
  const label = (r: Night | undefined) =>
    !r || (!r.custom && !r.house_of) ? "❔ not sure yet" : r.custom ? `📍 ${r.custom}` : r.house_of === meId ? "🏡 at yours" : `🏠 at ${nameOf(r.house_of!)}'s`;

  // null = "not sure" (saved, so it shows as your answer).
  async function set(value: { house_of: string } | { custom: string } | null) {
    const { error } = await supabase.from("sleep_nights").upsert({
      user_id: meId,
      night,
      house_of: value && "house_of" in value ? value.house_of : null,
      custom: value && "custom" in value ? value.custom : null,
      updated_at: new Date().toISOString(),
    });
    if (error) return toast(error.message);
    refreshAll();
  }
  return { ready: !!night && !!partner, mine, theirs, label, set };
}

/** Set where you're sleeping tonight. */
export function SleepControls() {
  const { meId, partner } = useApp();
  const { mine, theirs, label, set } = useSleepTonight();
  const [custom, setCustom] = useState<string | null>(null);
  if (!partner) return null;
  const choice = !mine ? null : mine.custom ? "custom" : !mine.house_of ? "unsure" : mine.house_of === meId ? "mine" : "theirs";
  return (
    <div className="stack-sm">
      <p>
        <strong>{partner.display_name}:</strong> {label(theirs)}
      </p>
      <span className="small muted">You</span>
      <div className="seg" role="group" aria-label="Where are you sleeping tonight">
        <button aria-pressed={choice === "mine"} onClick={() => set({ house_of: meId })}>
          My place
        </button>
        <button aria-pressed={choice === "theirs"} onClick={() => set({ house_of: partner.id })}>
          {partner.display_name}&apos;s
        </button>
        <button aria-pressed={choice === "custom"} onClick={() => setCustom(mine?.custom ?? "")}>
          Other
        </button>
        <button aria-pressed={choice === "unsure"} onClick={() => set(null)}>
          Not sure
        </button>
      </div>
      {custom !== null && (
        <form
          className="quick-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) set({ custom: custom.trim() }).then(() => setCustom(null));
          }}
        >
          <input className="input grow" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Mom's, the cabin…" aria-label="Where" autoFocus />
          <button className="btn btn-primary" disabled={!custom.trim()}>
            Set
          </button>
        </form>
      )}
      <p className="small faint">New night at 5am, fresh start.</p>
    </div>
  );
}
