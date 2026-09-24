"use client";

import { useRouter } from "next/navigation";
import { format, startOfDay } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive } from "@/lib/useLive";
import type { CalEvent } from "@/lib/types";
import { useApp } from "./AppProvider";

/** Every open ask, as a list: ones waiting on you, and ones you're waiting on. Tap to open it on the calendar. */
export function RequestsList({ onDone }: { onDone: () => void }) {
  const { meId, partner } = useApp();
  const router = useRouter();
  const { data: asks = [] } = useLive<CalEvent[]>(
    "events:asks:open",
    async () => {
      const { data, error } = await supabaseBrowser()
        .from("events")
        .select("*")
        .eq("type", "ask")
        .eq("response_status", "pending")
        .gte("start_time", startOfDay(new Date()).toISOString())
        .order("start_time");
      if (error) throw error;
      return data as CalEvent[];
    },
    ["events"],
  );
  const mine = asks.filter((a) => a.created_by !== meId);
  const theirs = asks.filter((a) => a.created_by === meId);
  const open = (e: CalEvent) => {
    onDone();
    router.push(`/calendar?event=${e.id}`);
  };
  const row = (e: CalEvent) => (
    <button key={e.id} className="task task-edit request-row" onClick={() => open(e)}>
      <span className="grow">
        <strong>{e.title}</strong>
        <span className="small muted" style={{ display: "block" }}>
          {format(new Date(e.start_time), e.all_day ? "EEE, MMM d" : "EEE, MMM d · h:mm a")}
        </span>
      </span>
      <span aria-hidden>›</span>
    </button>
  );
  return (
    <div className="stack">
      <div className="field">
        <span>Waiting on you</span>
        {mine.length ? <div className="card" style={{ padding: "2px 12px" }}>{mine.map(row)}</div> : <p className="small muted">Nothing. You&apos;re all caught up.</p>}
      </div>
      <div className="field">
        <span>You asked {partner?.display_name ?? "them"}</span>
        {theirs.length ? <div className="card" style={{ padding: "2px 12px" }}>{theirs.map(row)}</div> : <p className="small muted">No open asks.</p>}
      </div>
    </div>
  );
}
