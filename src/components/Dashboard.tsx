"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive } from "@/lib/useLive";
import { ago, useNow } from "@/lib/dates";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { SleepControls, useSleepTonight } from "./Sleep";
import { AnswerSheet, useVibe, vibeText } from "./Vibe";
import { MEAL_LABEL, MealPanel, useMealThread, type Meal } from "./MealThread";
import { PlanSheet, planWhen, usePlans } from "./Plans";

/**
 * Today at a glance. Everything here is read-only until you tap it; the
 * buttons live in the sheet that opens. Rows only show when there's
 * something to say (lunch always does, since it's a daily thing).
 */
export function Dashboard() {
  const now = useNow();
  if (!now) return <section className="card dash" aria-busy />;
  return <Today day={format(now, "yyyy-MM-dd")} />;
}

type Open = { kind: "sleep" } | { kind: "meal"; meal: Meal } | { kind: "vibe" } | { kind: "plan"; id: string } | null;

function Today({ day }: { day: string }) {
  const { partner } = useApp();
  const [open, setOpen] = useState<Open>(null);
  const sleep = useSleepTonight();
  const vibe = useVibe();
  const breakfast = useMealThread(day, "breakfast");
  const lunch = useMealThread(day, "lunch");
  const dinner = useMealThread(day, "dinner");
  const plans = usePlans(day);
  const dogTodos = useDogTodoCount();
  const them = partner?.display_name ?? "Them";

  return (
    <section className="card dash">
      {sleep.ready && (
        <Row icon="🌙" label="Tonight" onClick={() => setOpen({ kind: "sleep" })}>
          {them} {sleep.label(sleep.theirs)}
          <span className="small faint"> · you {sleep.mine ? sleep.label(sleep.mine) : "not set"}</span>
        </Row>
      )}

      {breakfast.msgs.length > 0 && (
        <Row icon="🥞" label="Breakfast" onClick={() => setOpen({ kind: "meal", meal: "breakfast" })}>
          {breakfast.summary}
        </Row>
      )}
      <Row icon="🥪" label="Lunch" onClick={() => setOpen({ kind: "meal", meal: "lunch" })}>
        {lunch.summary ?? <span className="muted">No lunch plans today. Any ideas?</span>}
      </Row>
      {dinner.msgs.length > 0 && (
        <Row icon="🍝" label="Dinner" onClick={() => setOpen({ kind: "meal", meal: "dinner" })}>
          {dinner.summary}
        </Row>
      )}

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

      {dogTodos > 0 && (
        <Row icon="🐾" label="Dogs" href="/dogs">
          {dogTodos} dog to-do{dogTodos === 1 ? "" : "s"}
        </Row>
      )}

      {open?.kind === "sleep" && (
        <Sheet title="Sleeping tonight" onClose={() => setOpen(null)}>
          <SleepControls />
        </Sheet>
      )}
      {open?.kind === "meal" && (
        <Sheet title={`${MEAL_LABEL[open.meal]} today`} onClose={() => setOpen(null)}>
          <MealPanel t={open.meal === "breakfast" ? breakfast : open.meal === "lunch" ? lunch : dinner} />
        </Sheet>
      )}
      {open?.kind === "vibe" && vibe.incoming && <AnswerSheet check={vibe.incoming} onClose={() => setOpen(null)} />}
      {open?.kind === "plan" && <PlanSheet id={open.id} onClose={() => setOpen(null)} />}
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
  const { data = 0 } = useLive<number>(
    "tasks:dogs:open:count",
    async () => {
      const { count, error } = await supabaseBrowser().from("tasks").select("id", { count: "exact", head: true }).eq("list_type", "dogs").eq("done", false);
      if (error) throw error;
      return count ?? 0;
    },
    ["tasks"],
  );
  return data;
}
