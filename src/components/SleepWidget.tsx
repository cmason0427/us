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

/**
 * Where each of you is sleeping tonight. You set yours; theirs is read-only.
 * Unset shows "Not set" to you and "not sure yet" to them. New night, fresh start.
 */
export function SleepWidget() {
  const now = useNow();
  if (!now) return null;
  return <Sleep night={nightOf(now)} />;
}

function Sleep({ night }: { night: string }) {
  const { meId, partner, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const [custom, setCustom] = useState<string | null>(null);
  const { data: rows = [] } = useLive<Night[]>(
    `sleep:${night}`,
    async () => {
      const { data, error } = await supabase.from("sleep_nights").select("user_id, house_of, custom").eq("night", night);
      if (error) throw error;
      return data as Night[];
    },
    ["sleep_nights"],
  );
  if (!partner) return null;

  const mine = rows.find((r) => r.user_id === meId);
  const theirs = rows.find((r) => r.user_id === partner.id);
  const place = (r: Night | undefined, viewer: string) =>
    !r ? null : r.custom ? r.custom : !r.house_of ? "not sure yet" : r.house_of === viewer ? "my place" : `${nameOf(r.house_of)}'s place`;

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
    setCustom(null);
    refreshAll();
  }

  const choice = !mine ? null : mine.custom ? "custom" : !mine.house_of ? "unsure" : mine.house_of === meId ? "mine" : "theirs";
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="row-between">
        <strong>Sleeping tonight</strong>
        <span className="small muted">
          {partner.display_name}: {place(theirs, partner.id) ?? "not sure yet"}
        </span>
      </div>
      <div className="seg" role="group" aria-label="Where are you sleeping tonight" style={{ marginTop: 8 }}>
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
          style={{ marginTop: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) set({ custom: custom.trim() });
          }}
        >
          <input className="input grow" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Mom's, the cabin…" aria-label="Where" autoFocus />
          <button className="btn btn-primary" disabled={!custom.trim()}>
            Set
          </button>
        </form>
      )}
      <p className="small muted" style={{ marginTop: 6 }}>
        You: {place(mine, meId) ?? "Not set"}
      </p>
    </section>
  );
}
