"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { timeLabel } from "@/lib/dates";
import { isActive } from "@/lib/activity";
import type { Activity } from "@/lib/types";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { Sortable } from "./Sortable";

// Time-block plans: "Saturday 1–5pm: do savers, then scrapbook". Both of you
// can change anything; it only reaches the feed when one of you sends it.

export interface DayPlan {
  id: string;
  day: string; // yyyy-MM-dd
  start_at: string; // HH:mm:ss
  end_at: string;
  title: string | null;
  sent_at: string | null;
  created_by: string;
  day_plan_items: { id: string; text: string; activity_id: string | null; position: number }[];
}

const hm = (t: string) => t.slice(0, 5);
const asDate = (day: string, t: string) => parseISO(`${day}T${hm(t)}`);
export const planWhen = (p: Pick<DayPlan, "day" | "start_at" | "end_at">) =>
  `${timeLabel(asDate(p.day, p.start_at))}–${timeLabel(asDate(p.day, p.end_at))}`;

export function usePlans(day: string) {
  const { data = [] } = useLive<DayPlan[]>(
    `plans:${day}`,
    async () => {
      const { data, error } = await supabaseBrowser()
        .from("day_plans")
        .select("*, day_plan_items(id, text, activity_id, position)")
        .eq("day", day)
        .order("start_at");
      if (error) throw error;
      return data as DayPlan[];
    },
    ["day_plans", "day_plan_items"],
  );
  return data;
}

/** The plans on a day, as cards, plus "plan a time block". */
export function PlanBlocks({ day, onOpen, onNew }: { day: Date; onOpen: (id: string) => void; onNew: () => void }) {
  const plans = usePlans(format(day, "yyyy-MM-dd"));
  return (
    <div className="stack-sm" style={{ marginTop: 12 }}>
      {plans.map((p) => {
        const items = [...p.day_plan_items].sort((a, b) => a.position - b.position);
        return (
          <button key={p.id} className="card plan-card" onClick={() => onOpen(p.id)}>
            <span className="small muted">
              🗓️ {planWhen(p)}
              {p.sent_at ? "" : " · just an idea"}
            </span>
            <strong>{p.title || "Time together"}</strong>
            {items.length > 0 && <span className="small">{items.map((i) => i.text).join(" → ")}</span>}
          </button>
        );
      })}
      <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={onNew}>
        + Plan a time block
      </button>
    </div>
  );
}

/** Make a new plan for a day, then open it for editing. */
export async function createPlan(meId: string, day: Date, firstActivity?: Activity) {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase
    .from("day_plans")
    .insert({ day: format(day, "yyyy-MM-dd"), start_at: "13:00", end_at: "17:00", created_by: meId })
    .select("id")
    .single();
  if (error) throw error;
  if (firstActivity) await supabase.from("day_plan_items").insert({ plan_id: data.id, text: firstActivity.name, activity_id: firstActivity.id, position: 0, created_by: meId });
  refreshAll();
  return data.id as string;
}

/** Everything about one plan, editable by both of you. */
export function PlanSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { meId, partner, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const { data: plan } = useLive<DayPlan | null>(
    `plan:${id}`,
    async () => {
      const { data } = await supabase.from("day_plans").select("*, day_plan_items(id, text, activity_id, position)").eq("id", id).maybeSingle();
      return data as DayPlan | null;
    },
    ["day_plans", "day_plan_items"],
  );
  const { data: notes = [] } = useLive<{ id: string; author: string; text: string; created_at: string }[]>(
    `plan_notes:${id}`,
    async () => {
      const { data } = await supabase.from("day_plan_notes").select("*").eq("plan_id", id).order("created_at");
      return data ?? [];
    },
    ["day_plan_notes"],
  );
  const { data: activities = [] } = useLive<Activity[]>(
    "activities",
    async () => {
      const { data, error } = await supabase.from("activities").select("*").order("name");
      if (error) throw error;
      return data as Activity[];
    },
    ["activities"],
  );
  const [itemDraft, setItemDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [showIdeas, setShowIdeas] = useState(false);

  if (plan === null) {
    return (
      <Sheet title="Plan" onClose={onClose}>
        <p className="muted">This plan was removed.</p>
      </Sheet>
    );
  }
  if (!plan) return null;
  const items = [...plan.day_plan_items].sort((a, b) => a.position - b.position);

  async function patch(fields: Partial<Pick<DayPlan, "day" | "start_at" | "end_at" | "title">>) {
    const { error } = await supabase.from("day_plans").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) toast(error.message);
    refreshAll();
  }
  async function addItem(text: string, activityId: string | null = null) {
    if (!text.trim()) return;
    await supabase.from("day_plan_items").insert({ plan_id: id, text: text.trim(), activity_id: activityId, position: items.length, created_by: meId });
    setItemDraft("");
    refreshAll();
  }
  async function reorder(ids: string[]) {
    await Promise.all(ids.map((itemId, position) => supabase.from("day_plan_items").update({ position }).eq("id", itemId)));
    refreshAll();
  }
  async function removeItem(itemId: string) {
    await supabase.from("day_plan_items").delete().eq("id", itemId);
    refreshAll();
  }
  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteDraft.trim()) return;
    const { error } = await supabase.from("day_plan_notes").insert({ plan_id: id, author: meId, text: noteDraft.trim() });
    if (error) return toast(error.message);
    setNoteDraft("");
    refreshAll();
  }
  async function send() {
    if (!partner || !plan) return;
    await supabase.from("day_plans").update({ sent_at: new Date().toISOString() }).eq("id", id);
    const when = format(parseISO(plan.day), "EEE, MMM d");
    const { data: post } = await supabase
      .from("posts")
      .insert({ author: meId, kind: "plan", plan_id: id, text: `📅 A new idea on your calendar for ${when}. Look whenever.` })
      .select("id")
      .single();
    if (post) notify({ kind: "plan", id: post.id });
    refreshAll();
    toast(`Sent to ${partner.display_name} 📅`);
  }
  async function remove() {
    if (!confirm("Remove this plan for both of you?")) return;
    await supabase.from("day_plans").delete().eq("id", id);
    refreshAll();
    onClose();
  }

  const unused = activities.filter((a) => isActive(a) && !items.some((i) => i.activity_id === a.id));

  return (
    <Sheet title={plan.title || "Time together"} onClose={onClose}>
      <div className="stack">
        <input className="input" defaultValue={plan.title ?? ""} placeholder="Name it (optional): Saturday afternoon" onBlur={(e) => e.target.value !== (plan.title ?? "") && patch({ title: e.target.value.trim() || null })} aria-label="Plan name" />
        <div className="grid-3">
          <input className="input" type="date" defaultValue={plan.day} onChange={(e) => e.target.value && patch({ day: e.target.value })} aria-label="Day" />
          <input className="input" type="time" defaultValue={hm(plan.start_at)} onChange={(e) => e.target.value && patch({ start_at: e.target.value })} aria-label="From" />
          <input className="input" type="time" defaultValue={hm(plan.end_at)} onChange={(e) => e.target.value && patch({ end_at: e.target.value })} aria-label="To" />
        </div>

        <div className="field">
          <span>In this order (drag to change)</span>
          {items.length > 0 && (
            <div className="card" style={{ padding: "2px 12px" }}>
              <Sortable
                items={items}
                getId={(i) => i.id}
                onReorder={reorder}
                render={(i, handle) => (
                  <div className="task">
                    <span className="batch-num">{items.indexOf(i) + 1}</span>
                    <span className="grow task-title">{i.text}</span>
                    <button className="icon-btn" onClick={() => removeItem(i.id)} aria-label={`Remove ${i.text}`}>
                      ×
                    </button>
                    {handle}
                  </div>
                )}
              />
            </div>
          )}
          <form
            className="quick-add"
            onSubmit={(e) => {
              e.preventDefault();
              addItem(itemDraft);
            }}
          >
            <input className="input grow" value={itemDraft} onChange={(e) => setItemDraft(e.target.value)} placeholder="Add something to do…" aria-label="Add to the plan" />
            <button className="btn" disabled={!itemDraft.trim()}>
              Add
            </button>
          </form>
          {unused.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setShowIdeas((s) => !s)}>
              {showIdeas ? "▾" : "▸"} From our ideas
            </button>
          )}
          {showIdeas && (
            <div className="chips">
              {unused.map((a) => (
                <button key={a.id} type="button" className="chip chip-sm" onClick={() => addItem(a.name, a.id)}>
                  + {a.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <span>Notes</span>
          {notes.map((n) => (
            <p key={n.id} className="small">
              <strong>{n.author === meId ? "You" : nameOf(n.author)}:</strong> {n.text}
            </p>
          ))}
          <form className="quick-add" onSubmit={addNote}>
            <input className="input grow" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Leave a note…" aria-label="Note" />
            <button className="btn" disabled={!noteDraft.trim()}>
              Add
            </button>
          </form>
        </div>

        <p className="small muted">You can both change anything here. It only shows on the calendar.</p>
        {partner &&
          (plan.sent_at ? (
            <p className="small faint">Shared with {partner.display_name}. Changes show up for them automatically.</p>
          ) : (
            <button className="btn btn-primary btn-block" onClick={send}>
              Send to {partner.display_name}
            </button>
          ))}
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={remove}>
          Remove plan
        </button>
      </div>
    </Sheet>
  );
}
