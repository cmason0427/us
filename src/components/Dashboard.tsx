"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive } from "@/lib/useLive";
import { ago, useNow } from "@/lib/dates";
import { isHiddenNow } from "@/lib/deadline";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { SleepControls, useSleepTonight } from "./Sleep";
import { AnswerSheet, useVibe, vibeText } from "./Vibe";
import { MEAL_LABEL, MealPanel, currentMeal, useMealThread, type Meal } from "./MealThread";
import { PlanSheet, planWhen, usePlans } from "./Plans";
import { TaskList } from "./TaskList";
import { useMealTimesRange } from "@/lib/mealTimes";
import { timeLabel } from "@/lib/dates";
import { EatHomeRows } from "./EatCheck";
import { OnLoopSheetBody, loopLine, useOnLoop } from "./OnLoop";
import { ChecklistPrompt, useChecklistPrompts } from "./Checklists";
import { StatusSheetBody, useMyStatus, usePartnerStatus } from "./Status";
import { WaterHomeLine, WaterHomeSheet, useWaterHome } from "./Water";

/**
 * Today at a glance. Everything here is read-only until you tap it; the
 * buttons live in the sheet that opens. Rows only show when there's
 * something to say (lunch always does, since it's a daily thing).
 */
export function Dashboard() {
  const now = useNow();
  if (!now) return <section className="card dash" aria-busy />;
  const { meal, day: mealDay } = currentMeal(now);
  return <Today day={format(now, "yyyy-MM-dd")} meal={meal} mealDay={mealDay} />;
}

type Open = { kind: "loop" } | { kind: "sleep" } | { kind: "meal" } | { kind: "later-meal"; meal: Meal } | { kind: "vibe" } | { kind: "plan"; id: string } | { kind: "dogs" } | { kind: "status"; mine: boolean } | { kind: "water" } | null;

const MEAL_ICON: Record<Meal, string> = { breakfast: "🥞", lunch: "🥪", dinner: "🍝" };

function Today({ day, meal, mealDay }: { day: string; meal: Meal; mealDay: string }) {
  const { partner } = useApp();
  const [open, setOpen] = useState<Open>(null);
  const sleep = useSleepTonight();
  const vibe = useVibe();
  // One meal at a time, by the clock (see currentMeal).
  const food = useMealThread(mealDay, meal);
  const mealName = MEAL_LABEL[meal];
  // Later meals the same day show up early once someone's asked or sent
  // options ("dinner?" at lunchtime), so nobody has to wait for the clock.
  const lunchLater = useMealThread(mealDay, "lunch");
  const dinnerLater = useMealThread(mealDay, "dinner");
  // "Dinner · 7 pm" when a meal has a set time.
  const times = useMealTimesRange(mealDay, mealDay);
  const at = (m: Meal) => {
    const x = times.find((y) => y.meal === m);
    return x ? ` · ${timeLabel(new Date(`${mealDay}T${x.at.slice(0, 5)}`))}` : "";
  };
  const later = (meal === "breakfast" ? [lunchLater, dinnerLater] : meal === "lunch" ? [dinnerLater] : []).filter((t) => t.latest || times.some((x) => x.meal === t.meal));
  const plans = usePlans(day);
  const dogTodos = useDogTodoCount();
  const status = usePartnerStatus();
  const myStatus = useMyStatus();
  const them = partner?.display_name ?? "Them";
  const chores = useChecklistPrompts();
  const loops = useOnLoop();
  const { meId, nameOf } = useApp();
  const water = useWaterHome();

  return (
    <section className="card dash">
      <EatHomeRows />
      {/* Stays until changed or taken off; nothing clears it. */}
      <Row icon="🎧" label="On loop" onClick={() => setOpen({ kind: "loop" })}>
        {loops.length ? loopLine(loops, meId, nameOf) : <span className="muted">What song do you have on repeat?</span>}
      </Row>
      {status && (
        <Row icon="🚗" label={them} onClick={() => setOpen({ kind: "status", mine: false })}>
          {status.text}
          <span className="small faint"> · {ago(status.updated_at)}{status.acked_at ? " · 👍" : ""}</span>
        </Row>
      )}
      {myStatus && (
        <Row icon="🚗" label="You said" onClick={() => setOpen({ kind: "status", mine: true })}>
          {myStatus.text}
          <span className="small faint"> · {myStatus.acked_at ? `${them} saw it 👍` : "not seen yet"}</span>
        </Row>
      )}
      {sleep.ready && (
        <Row icon="🌙" label="Tonight" onClick={() => setOpen({ kind: "sleep" })}>
          {them} {sleep.label(sleep.theirs)}
          <span className="small faint"> · you {sleep.mine ? sleep.label(sleep.mine) : "not set"}</span>
        </Row>
      )}

      <Row icon={MEAL_ICON[meal]} label={(day === mealDay ? mealName : `${mealName} tomorrow`) + at(meal)} onClick={() => setOpen({ kind: "meal" })}>
        {food.summary ?? <span className="muted">No {mealName.toLowerCase()} plans yet. Any ideas?</span>}
      </Row>

      {later.map((t) => (
        <Row key={t.meal} icon={MEAL_ICON[t.meal]} label={(day === mealDay ? MEAL_LABEL[t.meal] : `${MEAL_LABEL[t.meal]} tomorrow`) + at(t.meal)} onClick={() => setOpen({ kind: "later-meal", meal: t.meal })}>
          {t.summary ?? <span className="muted">Nothing picked yet.</span>}
        </Row>
      ))}

      {plans.map((p) => (
        <Row key={p.id} icon="🗓️" label={planWhen(p)} onClick={() => setOpen({ kind: "plan", id: p.id })}>
          {p.title || "Time together"}
        </Row>
      ))}

      {vibe.incoming ? (
        <Row icon="💭" label="Vibe check" onClick={() => setOpen({ kind: "vibe" })}>
          {them} wants to know how you&apos;re doing
        </Row>
      ) : vibe.theirAnswer ? (
        <Row icon="💭" label={`${them}'s vibe`}>
          {vibeText(vibe.theirAnswer)}
          {vibe.theirAnswer.answer && <span> “{vibe.theirAnswer.answer}”</span>}
          <span className="small faint"> · {ago(vibe.theirAnswer.answered_at!)}</span>
        </Row>
      ) : vibe.recentOutgoing ? (
        <Row icon="💭" label="Vibe check">
          <span className="muted">Asked {them} {ago(vibe.recentOutgoing.created_at)}</span>
        </Row>
      ) : null}

      {water.show && (
        <Row icon="💧" label="Water" onClick={() => setOpen({ kind: "water" })}>
          <WaterHomeLine total={water.total} s={water.settings} />
        </Row>
      )}

      {chores.day && chores.due.map((p) => <ChecklistPrompt key={p.id} p={p} day={chores.day!} />)}

      {dogTodos > 0 && (
        <Row icon="🐾" label="Dogs" onClick={() => setOpen({ kind: "dogs" })}>
          {dogTodos} dog to-do{dogTodos === 1 ? "" : "s"}
        </Row>
      )}


      {open?.kind === "loop" && (
        <Sheet title="🎧 On loop" onClose={() => setOpen(null)}>
          <OnLoopSheetBody />
        </Sheet>
      )}
      {open?.kind === "sleep" && (
        <Sheet title="Sleeping tonight" onClose={() => setOpen(null)}>
          <SleepControls />
        </Sheet>
      )}
      {open?.kind === "meal" && (
        <Sheet title={day === mealDay ? `${mealName} today` : `${mealName} tomorrow`} onClose={() => setOpen(null)}>
          <MealPanel t={food} />
        </Sheet>
      )}
      {open?.kind === "later-meal" && (
        <Sheet title={`${MEAL_LABEL[open.meal]} ${day === mealDay ? "today" : "tomorrow"}`} onClose={() => setOpen(null)}>
          <MealPanel t={open.meal === "lunch" ? lunchLater : dinnerLater} />
        </Sheet>
      )}
      {open?.kind === "vibe" && vibe.incoming && <AnswerSheet check={vibe.incoming} onClose={() => setOpen(null)} />}
      {open?.kind === "water" && <WaterHomeSheet onClose={() => setOpen(null)} />}
      {open?.kind === "plan" && <PlanSheet id={open.id} onClose={() => setOpen(null)} />}
      {open?.kind === "dogs" && (
        <Sheet title="🐾 Dog to-dos" onClose={() => setOpen(null)}>
          <TaskList listType="dogs" title="" hint="" />
        </Sheet>
      )}
      {open?.kind === "status" && (open.mine ? myStatus : status) && (
        <Sheet title={open.mine ? "Your heads-up" : `${them}'s heads-up`} onClose={() => setOpen(null)}>
          <StatusSheetBody s={(open.mine ? myStatus : status)!} onDone={() => setOpen(null)} />
        </Sheet>
      )}
    </section>
  );
}

function Row({ icon, label, children, onClick, href }: { icon: string; label: string; children: ReactNode; onClick?: () => void; href?: string }) {
  const body = (
    <>
      <span className="dash-icon" aria-hidden>
        {icon}
      </span>
      <span className="grow">
        <span className="dash-label">{label}</span>
        <span className="dash-value">{children}</span>
      </span>
      {(onClick || href) && (
        <span className="dash-more" aria-hidden>
          ›
        </span>
      )}
    </>
  );
  if (href)
    return (
      <Link className="dash-row" href={href}>
        {body}
      </Link>
    );
  if (!onClick) return <div className="dash-row">{body}</div>;
  return (
    <button className="dash-row" onClick={onClick}>
      {body}
    </button>
  );
}

function useDogTodoCount() {
  const now = useNow()?.getTime() ?? 0;
  const { data = [] } = useLive<{ window_start: string | null; due_at: string | null; done: boolean }[]>(
    "tasks:dogs:open",
    async () => {
      const { data, error } = await supabaseBrowser().from("tasks").select("window_start, due_at, done").eq("list_type", "dogs").eq("done", false);
      if (error) throw error;
      return data;
    },
    ["tasks"],
  );
  // Scheduled ones don't count until they show up in the list.
  return data.filter((t) => !isHiddenNow(t, now)).length;
}
