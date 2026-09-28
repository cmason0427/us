"use client";

import { useState, type ReactNode } from "react";
import { addDays, format, parseISO, startOfDay } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useNow } from "@/lib/dates";
import type { CalEvent } from "@/lib/types";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { EventPeek } from "./EventDetail";
import { MEAL_LABEL, MealPanel, currentMeal, useMealThread, type Meal } from "./MealThread";

const ORDER: Record<Meal, number> = { breakfast: 0, lunch: 1, dinner: 2 };
type Msg = { day: string; meal: Meal; author: string; kind: string; created_at: string };
type AskedTask = { id: string; title: string; asked_for: string };
type AskedItem = { id: string; text: string; asked_for: string; tasks: { title: string } | null };

/**
 * Every open request in one place: calendar asks, meals still being figured
 * out, and to-dos or checklist items one of you asked the other to do. Split
 * into what's waiting on you and what you're waiting on.
 */
export function AllRequests() {
  const { meId, partner, toast } = useApp();
  const now = useNow();
  const today = now ? format(now, "yyyy-MM-dd") : null;
  const db = supabaseBrowser();

  const { data: asks = [] } = useLive<CalEvent[]>(
    "events:asks:open",
    async () => {
      const { data, error } = await db.from("events").select("*").eq("type", "ask").eq("response_status", "pending").gte("start_time", startOfDay(new Date()).toISOString()).order("start_time");
      if (error) throw error;
      return data as CalEvent[];
    },
    ["events"],
  );
  const { data: msgs = [] } = useLive<Msg[]>(
    `lunch_msgs:open:${today}`,
    async () => {
      if (!today) return [];
      const { data, error } = await db.from("lunch_msgs").select("day, meal, author, kind, created_at").gte("day", today).order("created_at");
      if (error) throw error;
      return data as Msg[];
    },
    ["lunch_msgs"],
  );
  const { data: tasks = [] } = useLive<AskedTask[]>(
    "tasks:asked",
    async () => {
      const { data, error } = await db.from("tasks").select("id, title, asked_for").not("asked_for", "is", null).eq("done", false).is("claimed_by", null);
      if (error) throw error;
      return data as AskedTask[];
    },
    ["tasks"],
  );
  const { data: items = [] } = useLive<AskedItem[]>(
    "task_items:asked",
    async () => {
      const { data, error } = await db.from("task_items").select("id, text, asked_for, tasks(title)").not("asked_for", "is", null).eq("done", false).is("claimed_by", null);
      if (error) throw error;
      return data as unknown as AskedItem[];
    },
    ["task_items"],
  );
  const [peek, setPeek] = useState<string | null>(null);
  const [meal, setMeal] = useState<{ day: string; meal: Meal } | null>(null);
  if (!now || !today) return null;

  // The latest word on each meal, for meals that haven't passed.
  const cur = currentMeal(now);
  const latest = new Map<string, Msg>();
  for (const m of msgs) latest.set(`${m.day}|${m.meal}`, m);
  const meals = [...latest.values()]
    .filter((m) => m.kind !== "decided" && m.kind !== "surprise")
    .filter((m) => m.day > cur.day || (m.day === cur.day && ORDER[m.meal] >= ORDER[cur.meal]))
    .sort((a, b) => a.day.localeCompare(b.day) || ORDER[a.meal] - ORDER[b.meal]);
  const when = (day: string, m: Meal) => {
    const tomorrow = format(addDays(now, 1), "yyyy-MM-dd");
    if (day === today) return m === "dinner" ? "Dinner tonight" : `${MEAL_LABEL[m]} today`;
    if (day === tomorrow) return `${MEAL_LABEL[m]} tomorrow`;
    return `${MEAL_LABEL[m]} ${format(parseISO(day), "EEE M/d")}`;
  };

  async function take(table: "tasks" | "task_items", id: string) {
    const { error } = await db.from(table).update({ claimed_by: meId, asked_for: null }).eq("id", id);
    if (error) return toast(error.message);
    refreshAll();
    toast("It's yours 🙋");
  }
  async function pass(table: "tasks" | "task_items", id: string) {
    await db.from(table).update({ asked_for: null }).eq("id", id);
    refreshAll();
  }
  async function unask(table: "tasks" | "task_items", id: string) {
    await db.from(table).update({ asked_for: null }).eq("id", id);
    refreshAll();
  }

  const calRow = (e: CalEvent) => (
    <Row key={e.id} icon="📅" title={e.title} sub={format(new Date(e.start_time), e.all_day ? "EEE, MMM d" : "EEE, MMM d · h:mm a")} onOpen={() => setPeek(e.id)} />
  );
  const mealRow = (m: Msg) => <FoodRow key={`${m.day}|${m.meal}`} day={m.day} meal={m.meal} label={when(m.day, m.meal)} onOpen={() => setMeal({ day: m.day, meal: m.meal })} />;
  const todoRow = (table: "tasks" | "task_items", id: string, title: string, sub: string | null, mine: boolean) => (
    <Row key={id} icon="✅" title={title} sub={sub}>
      {mine ? (
        <>
          <button className="claim claim-sm" onClick={() => take(table, id)}>
            🙋 I&apos;ll do it
          </button>
          <button className="claim claim-sm" onClick={() => pass(table, id)}>
            not this time
          </button>
        </>
      ) : (
        <button className="claim claim-sm" onClick={() => unask(table, id)}>
          take it back
        </button>
      )}
    </Row>
  );

  const onYou = [
    ...asks.filter((a) => a.created_by !== meId).map(calRow),
    ...meals.filter((m) => m.author !== meId).map(mealRow),
    ...tasks.filter((t) => t.asked_for === meId).map((t) => todoRow("tasks", t.id, t.title, null, true)),
    ...items.filter((i) => i.asked_for === meId).map((i) => todoRow("task_items", i.id, i.text, i.tasks?.title ? `from ${i.tasks.title}` : null, true)),
  ];
  const onThem = [
    ...asks.filter((a) => a.created_by === meId).map(calRow),
    ...meals.filter((m) => m.author === meId).map(mealRow),
    ...tasks.filter((t) => t.asked_for !== meId).map((t) => todoRow("tasks", t.id, t.title, null, false)),
    ...items.filter((i) => i.asked_for !== meId).map((i) => todoRow("task_items", i.id, i.text, i.tasks?.title ? `from ${i.tasks.title}` : null, false)),
  ];

  return (
    <div className="stack">
      <div className="field">
        <span>Waiting on you</span>
        {onYou.length ? <div className="card" style={{ padding: "2px 12px" }}>{onYou}</div> : <p className="small muted">Nothing. You&apos;re all caught up.</p>}
      </div>
      <div className="field">
        <span>You asked {partner?.display_name ?? "them"}</span>
        {onThem.length ? <div className="card" style={{ padding: "2px 12px" }}>{onThem}</div> : <p className="small muted">Nothing open.</p>}
      </div>
      {peek && <EventPeek id={peek} onClose={() => setPeek(null)} />}
      {meal && <FoodSheet day={meal.day} meal={meal.meal} title={when(meal.day, meal.meal)} onClose={() => setMeal(null)} />}
    </div>
  );
}

function Row({ icon, title, sub, onOpen, children }: { icon: string; title: string; sub?: ReactNode; onOpen?: () => void; children?: ReactNode }) {
  const body = (
    <>
      <span aria-hidden>{icon}</span>
      <span className="grow">
        <strong>{title}</strong>
        {sub && (
          <span className="small muted" style={{ display: "block" }}>
            {sub}
          </span>
        )}
        {children && <span className="claim-row">{children}</span>}
      </span>
      {onOpen && <span aria-hidden>›</span>}
    </>
  );
  return onOpen ? (
    <button className="task task-edit request-row" onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className="task request-row">{body}</div>
  );
}

function FoodRow({ day, meal, label, onOpen }: { day: string; meal: Meal; label: string; onOpen: () => void }) {
  const t = useMealThread(day, meal);
  return <Row icon="🍽️" title={label} sub={t.summary} onOpen={onOpen} />;
}

function FoodSheet({ day, meal, title, onClose }: { day: string; meal: Meal; title: string; onClose: () => void }) {
  const t = useMealThread(day, meal);
  return (
    <Sheet title={title} onClose={onClose}>
      <MealPanel t={t} />
    </Sheet>
  );
}
