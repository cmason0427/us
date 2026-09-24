"use client";

import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { celebrate } from "@/lib/celebrate";
import { useNow } from "@/lib/dates";
import { dueLabel, isOverdue } from "@/lib/deadline";
import type { Task } from "@/lib/types";
import { useApp } from "./AppProvider";
import { DogPic } from "./DogPic";

/** Open dog to-dos, pinned to the top of the feed until someone checks them off. */
export function DogTodos() {
  const { meId, nameOf } = useApp();
  const now = useNow();
  const { data: tasks = [] } = useLive<Task[]>(
    "tasks:dogs:open",
    async () => {
      const { data, error } = await supabaseBrowser().from("tasks").select("*").eq("list_type", "dogs").eq("done", false).order("created_at");
      if (error) throw error;
      return data as Task[];
    },
    ["tasks"],
  );
  if (!tasks.length) return null;

  async function check(t: Task, el: HTMLElement) {
    celebrate(el, ["🐾", "🦴"]);
    await supabaseBrowser().from("tasks").update({ done: true, done_at: new Date().toISOString(), done_by: meId }).eq("id", t.id);
    refreshAll();
  }

  return (
    <section className="card card-stitched" style={{ marginTop: 16, padding: "12px 14px" }}>
      <div className="row-between">
        <strong className="row" style={{ gap: 6 }}>
          <DogPic name="food_bowl" size={24} /> Dog to-dos
        </strong>
        <Link className="small muted" href="/dogs">
          See all
        </Link>
      </div>
      {tasks.map((t) => (
        <div key={t.id} className="task">
          <input type="checkbox" className="check" checked={false} onChange={(e) => check(t, e.currentTarget)} aria-label={`Done: ${t.title}`} />
          <div className="grow">
            <div className="task-title">{t.title}</div>
            <div className="small faint">
              {t.due_at && now && (
                <span className={`due${isOverdue(t, now.getTime()) ? " overdue" : ""}`}>{dueLabel({ due_at: t.due_at, due_all_day: t.due_all_day }, now)} · </span>
              )}
              {t.claimed_by ? `${nameOf(t.claimed_by)}'s on it` : `from ${nameOf(t.created_by)}`}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
