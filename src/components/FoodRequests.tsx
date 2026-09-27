"use client";

import { useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive } from "@/lib/useLive";
import { useNow } from "@/lib/dates";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { MEAL_LABEL, MealPanel, currentMeal, useMealThread, type Meal } from "./MealThread";

const ORDER: Record<Meal, number> = { breakfast: 0, lunch: 1, dinner: 2 };
type Msg = { day: string; meal: Meal; author: string; kind: string; created_at: string };

/**
 * Every meal still being figured out, like calendar Requests: ones waiting on
 * you, and ones you're waiting on. Decided meals and surprises drop off.
 */
export function FoodRequests() {
  const { meId, partner } = useApp();
  const now = useNow();
  const today = now ? format(now, "yyyy-MM-dd") : null;
  const { data: msgs = [] } = useLive<Msg[]>(
    `lunch_msgs:open:${today}`,
    async () => {
      if (!today) return [];
      const { data, error } = await supabaseBrowser().from("lunch_msgs").select("day, meal, author, kind, created_at").gte("day", today).order("created_at");
      if (error) throw error;
      return data as Msg[];
    },
    ["lunch_msgs"],
  );
  const [open, setOpen] = useState<{ day: string; meal: Meal } | null>(null);
  if (!now || !today) return null;

  // The latest word on each meal, for meals that haven't passed.
  const cur = currentMeal(now);
  const latest = new Map<string, Msg>();
  for (const m of msgs) latest.set(`${m.day}|${m.meal}`, m);
  const openOnes = [...latest.values()]
    .filter((m) => m.kind !== "decided" && m.kind !== "surprise")
    .filter((m) => m.day > cur.day || (m.day === cur.day && ORDER[m.meal] >= ORDER[cur.meal]))
    .sort((a, b) => a.day.localeCompare(b.day) || ORDER[a.meal] - ORDER[b.meal]);
  const onYou = openOnes.filter((m) => m.author !== meId);
  const onThem = openOnes.filter((m) => m.author === meId);

  const when = (day: string, meal: Meal) => {
    const d = parseISO(day);
    const tomorrow = format(addDays(now, 1), "yyyy-MM-dd");
    const label = MEAL_LABEL[meal];
    if (day === today) return meal === "dinner" ? "Dinner tonight" : `${label} today`;
    if (day === tomorrow) return `${label} tomorrow`;
    return `${label} ${format(d, "EEE M/d")}`;
  };
  const list = (rows: typeof openOnes) => (
    <div className="card" style={{ padding: "2px 12px" }}>
      {rows.map((m) => (
        <FoodRequestRow key={`${m.day}|${m.meal}`} day={m.day} meal={m.meal} label={when(m.day, m.meal)} onOpen={() => setOpen({ day: m.day, meal: m.meal })} />
      ))}
    </div>
  );

  return (
    <div className="stack">
      <div className="field">
        <span>Waiting on you</span>
        {onYou.length ? list(onYou) : <p className="small muted">Nothing. You&apos;re all caught up.</p>}
      </div>
      <div className="field">
        <span>You asked {partner?.display_name ?? "them"}</span>
        {onThem.length ? list(onThem) : <p className="small muted">No open food asks.</p>}
      </div>
      {open && <FoodRequestSheet day={open.day} meal={open.meal} title={when(open.day, open.meal)} onClose={() => setOpen(null)} />}
    </div>
  );
}

function FoodRequestRow({ day, meal, label, onOpen }: { day: string; meal: Meal; label: string; onOpen: () => void }) {
  const t = useMealThread(day, meal);
  return (
    <button className="task task-edit request-row" onClick={onOpen}>
      <span className="grow">
        <strong>{label}</strong>
        <span className="small muted" style={{ display: "block" }}>
          {t.summary}
        </span>
      </span>
      <span aria-hidden>›</span>
    </button>
  );
}

function FoodRequestSheet({ day, meal, title, onClose }: { day: string; meal: Meal; title: string; onClose: () => void }) {
  const t = useMealThread(day, meal);
  return (
    <Sheet title={title} onClose={onClose}>
      <MealPanel t={t} />
    </Sheet>
  );
}
