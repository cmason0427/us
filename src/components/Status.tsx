"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useNow } from "@/lib/dates";
import { notify } from "@/lib/notify";
import { useApp } from "./AppProvider";

// A status stops showing on Home after this long.
export const STATUS_MS = 60 * 60 * 1000;
const PRESETS = ["🚗 Leaving now", "🏡 Home in ~20", "⏰ Running a little late", "💼 Stuck at work a bit longer", "🛒 Stopping at the store", "🏠 Home"];

export function useStatuses() {
  const { data = [] } = useLive<{ user_id: string; text: string; updated_at: string }[]>(
    "statuses",
    async () => {
      const { data, error } = await supabaseBrowser().from("statuses").select("*");
      if (error) throw error;
      return data;
    },
    ["statuses"],
  );
  return data;
}

/** Their latest "on my way" line, if it's recent. */
export function usePartnerStatus() {
  const { partner } = useApp();
  const now = useNow()?.getTime() ?? 0;
  const s = useStatuses().find((x) => x.user_id === partner?.id);
  return s && now - Date.parse(s.updated_at) < STATUS_MS ? s : null;
}

/** One tap: a quiet heads-up. No reply expected. */
export function StatusPicker({ onDone }: { onDone: () => void }) {
  const { meId, partner, toast } = useApp();
  const [custom, setCustom] = useState("");
  async function send(text: string) {
    const { error } = await supabaseBrowser().from("statuses").upsert({ user_id: meId, text: text.trim(), updated_at: new Date().toISOString() });
    if (error) return toast(error.message);
    notify({ kind: "status" });
    refreshAll();
    toast(`${partner?.display_name ?? "They"}'ll see it 💛`);
    onDone();
  }
  return (
    <div className="stack">
      <p className="small muted">A quick heads-up for {partner?.display_name ?? "them"}. It shows on Home for an hour; no reply needed.</p>
      <div className="stack-sm">
        {PRESETS.map((p) => (
          <button key={p} className="btn btn-block" onClick={() => send(p)}>
            {p}
          </button>
        ))}
      </div>
      <form
        className="quick-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim()) send(custom);
        }}
      >
        <input className="input grow" value={custom} maxLength={120} onChange={(e) => setCustom(e.target.value)} placeholder="Or say it your way…" aria-label="Your own words" />
        <button className="btn btn-primary" disabled={!custom.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
