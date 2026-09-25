"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useNow } from "@/lib/dates";
import { notify } from "@/lib/notify";
import { useApp } from "./AppProvider";
import { ResetVotes } from "./ResetVotes";

// A status stops showing on Home after this long.
export const STATUS_MS = 60 * 60 * 1000;
const PRESETS = ["🚗 Leaving now", "🏡 Home in ~20", "⏰ Running a little late", "💼 Stuck at work a bit longer", "🛒 Stopping at the store", "🏠 Home"];

export interface Status {
  user_id: string;
  text: string;
  updated_at: string;
  acked_at: string | null;
  reset_votes: string[];
}

export function useStatuses() {
  const { data = [] } = useLive<Status[]>(
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

// Shows for an hour, and never past midnight.
const live = (s: Status | undefined, now: number) => (s && now - Date.parse(s.updated_at) < STATUS_MS && new Date(s.updated_at).toDateString() === new Date(now).toDateString() ? s : null);

/** Their latest "on my way" line, if it's recent. */
export function usePartnerStatus() {
  const { partner } = useApp();
  const now = useNow()?.getTime() ?? 0;
  return live(useStatuses().find((x) => x.user_id === partner?.id), now);
}
/** Mine, so I can take it back (or see that they saw it). */
export function useMyStatus() {
  const { meId } = useApp();
  const now = useNow()?.getTime() ?? 0;
  return live(useStatuses().find((x) => x.user_id === meId), now);
}

/**
 * The status popup. Theirs: "👍 got it". Mine: take it back until they've
 * seen it; after that, both of you reset it (or it clears itself).
 */
export function StatusSheetBody({ s, onDone }: { s: Status; onDone: () => void }) {
  const { meId, toast } = useApp();
  const mine = s.user_id === meId;
  const supabase = supabaseBrowser();
  return (
    <div className="stack">
      <p>{s.text}</p>
      {s.acked_at ? (
        <p className="small muted">{mine ? "👍 they saw it" : "👍 you said got it"}</p>
      ) : mine ? (
        <p className="small muted">Not seen yet.</p>
      ) : null}
      {!mine && !s.acked_at && (
        <button
          className="btn btn-primary"
          onClick={async () => {
            await supabase.from("statuses").update({ acked_at: new Date().toISOString() }).eq("user_id", s.user_id);
            refreshAll();
            onDone();
          }}
        >
          👍 Got it
        </button>
      )}
      {mine && !s.acked_at && (
        <button
          className="btn"
          onClick={async () => {
            await supabase.from("statuses").delete().eq("user_id", meId);
            refreshAll();
            toast("Took it back");
            onDone();
          }}
        >
          ↩ Take it back
        </button>
      )}
      {s.acked_at && <ResetVotes table="statuses" match={{ user_id: s.user_id }} votes={s.reset_votes ?? []} />}
    </div>
  );
}

/** One tap: a quiet heads-up. No reply expected. */
export function StatusPicker({ onDone }: { onDone: () => void }) {
  const { meId, partner, toast } = useApp();
  const [custom, setCustom] = useState("");
  async function send(text: string) {
    // A new one starts fresh: not seen, no reset votes.
    const { error } = await supabaseBrowser().from("statuses").upsert({ user_id: meId, text: text.trim(), updated_at: new Date().toISOString(), acked_at: null, reset_votes: [] });
    if (error) return toast(error.message);
    notify({ kind: "status" });
    refreshAll();
    toast(`${partner?.display_name ?? "They"}'ll see it 💛`);
    onDone();
  }
  return (
    <div className="stack">
      <p className="small muted">A quick heads-up for {partner?.display_name ?? "them"}. It shows on Home for an hour; they can tap “got it”, and you can take it back until they do.</p>
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
