"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInMinutes,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive } from "@/lib/useLive";
import { CAL_COLORS, Swatch, colorVar, useColorLabels } from "@/components/CalendarColors";
import { PlanCard, PlanSheet, createPlan, planEnd, planStart, usePlansRange, type DayPlan } from "@/components/Plans";
import { EVENT_TYPE_LABEL, effectiveType, type CalEvent, type EventType } from "@/lib/types";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sticker } from "@/components/Sticker";
import { Sheet } from "@/components/Sheet";
import { EventForm } from "@/components/EventForm";
import { AskActions, EventBadges, EventDetail, endOf, startOf, whenText } from "@/components/EventDetail";
import { IconChevron, IconPlus, Wavy } from "@/components/Art";
import { MEAL_EMOJI, useMealTimesRange, type MealTime } from "@/lib/mealTimes";
import { timeLabel } from "@/lib/dates";
import { MEAL_LABEL, MealPanel, useMealThread } from "@/components/MealThread";
import { PinForm, PinSheet, pinWhen, useCalTasksRange, usePinsRange, type CalPin } from "@/components/Pins";
import { TaskForm } from "@/components/TaskForm";
import type { Task } from "@/lib/types";

type View = "day" | "week" | "month" | "agenda";
type AgendaRange = "today" | "week" | "month" | "upcoming";

const HOUR_PX = 52;

/* ─── helpers ───────────────────────────────────────────────────────────── */


function onDay(e: CalEvent, day: Date) {
  const s = startOf(e);
  const en = endOf(e);
  const ds = startOfDay(day);
  const de = endOfDay(day);
  if (en.getTime() === s.getTime()) return s >= ds && s <= de;
  return s <= de && en > ds;
}

function sortEvents(list: CalEvent[]) {
  return [...list].sort((a, b) => Number(b.all_day) - Number(a.all_day) || startOf(a).getTime() - startOf(b).getTime());
}

function rangeFor(view: View, cursor: Date, agenda: AgendaRange): [Date, Date] {
  const today = new Date();
  switch (view) {
    case "day":
      return [startOfDay(cursor), endOfDay(cursor)];
    case "week":
      return [startOfWeek(cursor), endOfWeek(cursor)];
    case "month":
      return [startOfWeek(startOfMonth(cursor)), endOfWeek(endOfMonth(cursor))];
    case "agenda":
      if (agenda === "today") return [startOfDay(today), endOfDay(today)];
      if (agenda === "week") return [startOfDay(today), endOfWeek(today)];
      if (agenda === "month") return [startOfDay(today), endOfMonth(today)];
      return [startOfDay(today), endOfDay(addDays(today, 120))];
  }
}

/* ─── page ──────────────────────────────────────────────────────────────── */

export default function CalendarPage() {
  const [view, setView] = useState<View>("agenda");
  const [agenda, setAgenda] = useState<AgendaRange>("week");
  const [cursor, setCursor] = useState(() => new Date());
  // Deep link from a push notification: /calendar?event=<id>
  const params = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(params.get("event"));
  // ?plan=… (from the feed) opens that time-block plan on its day.
  const [planId, setPlanId] = useState<string | null>(params.get("plan"));
  const [editing, setEditing] = useState<CalEvent | "new" | null>(null);

  const { meId, toast, profiles } = useApp();
  const [from, to] = rangeFor(view, cursor, agenda);
  const [showFilters, setShowFilters] = useState(false);
  const [whoFilter, setWhoFilter] = useState<Who[]>([]);
  const [colorFilter, setColorFilter] = useState<string[]>([]);
  const { data: allEvents = [] } = useLive<CalEvent[]>(
    `events:${from.toISOString()}:${to.toISOString()}`,
    async () => {
      const { data, error } = await supabaseBrowser()
        .from("events")
        .select("*")
        .lte("start_time", to.toISOString())
        .or(`end_time.gte."${from.toISOString()}",start_time.gte."${from.toISOString()}"`)
        .order("start_time");
      if (error) throw error;
      return data as CalEvent[];
    },
    ["events"],
  );

  const filtering = whoFilter.length > 0 || colorFilter.length > 0;
  const events = allEvents.filter(
    (e) => (!whoFilter.length || whoFilter.includes(whoOf(e, meId))) && (!colorFilter.length || (e.color !== null && colorFilter.includes(e.color))),
  );

  // Time-block plans sit behind events: faded, and anything real goes on top.
  const plans = usePlansRange(format(from, "yyyy-MM-dd"), format(to, "yyyy-MM-dd"));
  // Plans are things together: they stay unless a filter rules that out.
  const plansVisible = !colorFilter.length && (!whoFilter.length || whoFilter.includes("both"));
  const plansOn = (d: Date) => (plansVisible ? plans.filter((p) => p.day === format(d, "yyyy-MM-dd")) : []);
  // Meals with a set time ("dinner at 7") are together things too.
  const mealTimes = useMealTimesRange(format(from, "yyyy-MM-dd"), format(to, "yyyy-MM-dd"));
  const mealsOn = (d: Date) => (plansVisible ? mealTimes.filter((m) => m.day === format(d, "yyyy-MM-dd")) : []);
  const [openMeal, setOpenMeal] = useState<MealTime | null>(null);
  // Pins ("🎳 bowling · 7 pm") and to-dos with a time marked for the calendar.
  const pins = usePinsRange(format(from, "yyyy-MM-dd"), format(to, "yyyy-MM-dd"));
  const calTasks = useCalTasksRange(startOfDay(from).toISOString(), endOfDay(to).toISOString());
  const [openPin, setOpenPin] = useState<CalPin | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [pinning, setPinning] = useState(false);
  const extrasOn = (d: Date): Extra[] => {
    const k = format(d, "yyyy-MM-dd");
    return [
      ...(plansVisible ? pins.filter((p) => p.day === k) : []).map((p) => ({ key: p.id, at: p.at.slice(0, 5), emoji: p.emoji || "📍", text: p.title, when: pinWhen(p), open: () => setOpenPin(p) })),
      ...calTasks
        .filter((t) => format(new Date(t.due_at), "yyyy-MM-dd") === k)
        .map((t) => ({ key: t.id, at: format(new Date(t.due_at), "HH:mm"), emoji: t.done ? "✅" : "☑️", text: t.title, when: `due ${timeLabel(new Date(t.due_at))}`, done: t.done, open: () => setOpenTask(t.id) })),
    ];
  };

  // Pending asks waiting on me, regardless of the visible range.
  const { data: waiting = [] } = useLive<CalEvent[]>(
    "events:waiting",
    async () => {
      const { data } = await supabaseBrowser()
        .from("events")
        .select("*")
        .eq("type", "ask")
        .eq("response_status", "pending")
        .neq("created_by", meId)
        .gte("start_time", startOfDay(new Date()).toISOString())
        .order("start_time");
      return (data ?? []) as CalEvent[];
    },
    ["events"],
  );

  // The open event usually lives in a loaded range; if not (deep link to a
  // far-off date), fetch it on its own.
  const loaded = openId ? (events.find((e) => e.id === openId) ?? waiting.find((e) => e.id === openId)) : undefined;
  const [fetched, setFetched] = useState<CalEvent | null>(null);
  useEffect(() => {
    if (!openId || loaded) return;
    supabaseBrowser()
      .from("events")
      .select("*")
      .eq("id", openId)
      .maybeSingle()
      .then(({ data }) => setFetched(data as CalEvent | null));
  }, [openId, loaded]);
  const openEvent = loaded ?? (fetched?.id === openId ? fetched : null);

  const step = (dir: 1 | -1) =>
    setCursor((c) => (view === "day" ? addDays(c, dir) : view === "week" ? addWeeks(c, dir) : addMonths(c, dir)));

  const title =
    view === "day"
      ? format(cursor, "EEEE, MMM d")
      : view === "week"
        ? `${format(startOfWeek(cursor), "MMM d")} – ${format(endOfWeek(cursor), isSameMonth(startOfWeek(cursor), endOfWeek(cursor)) ? "d" : "MMM d")}`
        : format(cursor, "MMMM yyyy");

  const open = (e: CalEvent) => setOpenId(e.id);

  return (
    <main className="page">
      <PageHead eyebrow="What's coming up" title="Calendar" art={<Sticker name="duo_mountains" size={84} tilt={-3} />} />
      <Wavy className="sage" />

      {waiting.length > 0 && (
        <section className="stack-sm" style={{ marginBottom: 16 }}>
          <div className="section-title" style={{ marginTop: 0 }}>
            <span className="sticker butter">💌 Needs your answer</span>
          </div>
          {waiting.map((e) => (
            <EventCard key={e.id} e={e} onOpen={open} showDate />
          ))}
        </section>
      )}

      <div className="seg" role="group" aria-label="View">
        {(["day", "week", "month", "agenda"] as View[]).map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {v === "agenda" ? "List" : v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {view === "agenda" ? (
        <div className="chips" style={{ margin: "12px 0" }}>
          {(
            [
              ["today", "Today"],
              ["week", "This week"],
              ["month", "This month"],
              ["upcoming", "Everything ahead"],
            ] as [AgendaRange, string][]
          ).map(([k, label]) => (
            <button key={k} className="chip" aria-pressed={agenda === k} onClick={() => setAgenda(k)}>
              {label}
            </button>
          ))}
        </div>
      ) : (
        <div className="cal-toolbar">
          <button className="icon-btn" onClick={() => step(-1)} aria-label="Previous">
            <IconChevron dir="left" />
          </button>
          <button className="btn btn-ghost cal-title" onClick={() => setCursor(new Date())} title="Jump to today">
            {title}
          </button>
          <button className="icon-btn" onClick={() => step(1)} aria-label="Next">
            <IconChevron />
          </button>
        </div>
      )}

      <div className="row-between" style={{ marginBottom: 6 }}>
        <span />
        <button className="btn btn-sm btn-ghost" aria-pressed={showFilters || filtering} onClick={() => setShowFilters((f) => !f)}>
          {filtering ? `Filtered (${whoFilter.length + colorFilter.length})` : "Filter"}
        </button>
      </div>
      {showFilters && <CalendarFilters who={whoFilter} setWho={setWhoFilter} colors={colorFilter} setColors={setColorFilter} />}

      <div className="legend">
        <span>
          <i className="swatch" data-type="confirmed" /> {EVENT_TYPE_LABEL.confirmed}
        </span>
        {profiles.map((p) => (
          <span key={p.id}>
            <i className="swatch" data-type="solo" data-person={p.cal_color} /> Just {p.id === meId ? "me" : p.display_name}
          </span>
        ))}
        {(["ask", "radar"] as EventType[]).map((t) => (
          <span key={t}>
            <i className="swatch" data-type={t} /> {EVENT_TYPE_LABEL[t]}
          </span>
        ))}
        <span>
          <i className="swatch swatch-plan" /> Time block
        </span>
      </div>

      {view === "agenda" && <Agenda events={events} from={from} to={to} onOpen={open} plansOn={plansOn} onOpenPlan={setPlanId} mealsOn={mealsOn} onOpenMeal={setOpenMeal} extrasOn={extrasOn} />}
      {view === "month" && <Month cursor={cursor} events={events} onOpen={open} onPickDay={setCursor} plansOn={plansOn} onOpenPlan={setPlanId} mealsOn={mealsOn} onOpenMeal={setOpenMeal} extrasOn={extrasOn} />}
      {view === "week" && (
        <Week
          cursor={cursor}
          events={events}
          onOpen={open}
          onPickDay={(d) => {
            setCursor(d);
            setView("day");
          }}
          plansOn={plansOn}
          onOpenPlan={setPlanId}
          mealsOn={mealsOn}
          onOpenMeal={setOpenMeal}
          extrasOn={extrasOn}
        />
      )}
      {view === "day" && <Day day={cursor} events={events} onOpen={open} plans={plansOn(cursor)} onOpenPlan={setPlanId} meals={mealsOn(cursor)} onOpenMeal={setOpenMeal} extras={extrasOn(cursor)} />}
      {(view === "day" || view === "month") && (
        <button
          className="btn btn-sm"
          style={{ marginTop: 12 }}
          onClick={async () => {
            try {
              setPlanId(await createPlan(meId, cursor));
            } catch (err) {
              toast((err as Error).message);
            }
          }}
        >
          + Plan a time block
        </button>
      )}
      {(view === "day" || view === "month") && (
        <button className="btn btn-sm" style={{ marginTop: 12, marginLeft: 8 }} onClick={() => setPinning(true)}>
          📍 Pin something at a time
        </button>
      )}
      {openMeal && <CalMealSheet m={openMeal} onClose={() => setOpenMeal(null)} />}
      {openPin && <PinSheet pin={openPin} onClose={() => setOpenPin(null)} />}
      {openTask && <CalTaskSheet id={openTask} onClose={() => setOpenTask(null)} />}
      {pinning && (
        <Sheet title="📍 Pin something" onClose={() => setPinning(false)}>
          <PinForm defaultDay={view === "agenda" ? undefined : format(cursor, "yyyy-MM-dd")} onDone={() => setPinning(false)} />
        </Sheet>
      )}
      {planId && (
        <PlanSheet
          id={planId}
          onClose={() => {
            setPlanId(null);
            if (window.location.search) window.history.replaceState(null, "", "/calendar");
          }}
        />
      )}

      <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          <IconPlus width={18} height={18} /> Add a plan{view !== "agenda" && !isToday(cursor) && view !== "week" ? ` on ${format(cursor, "MMM d")}` : ""}
        </button>
      </div>

      {openEvent && !editing && (
        <EventDetail
          e={openEvent}
          onClose={() => {
            setOpenId(null);
            if (window.location.search) window.history.replaceState(null, "", "/calendar");
          }}
          onEdit={() => setEditing(openEvent)}
        />
      )}
      {editing && (
        <Sheet title={editing === "new" ? "New plan" : "Edit plan"} onClose={() => setEditing(null)}>
          <EventForm
            initial={editing === "new" ? undefined : editing}
            defaultDate={view === "agenda" ? undefined : cursor}
            onDone={() => {
              setEditing(null);
              setOpenId(null);
            }}
          />
        </Sheet>
      )}
    </main>
  );
}


/** Whose color a "just one of us" plan gets (pink / green, the same on both phones). */
function usePersonColor() {
  const { profiles } = useApp();
  return (e: CalEvent) => (effectiveType(e) === "solo" ? profiles.find((p) => p.id === e.created_by)?.cal_color : undefined);
}

/** The color marker, as a CSS variable the stripe reads. */
const markStyle = (e: CalEvent) => (e.color ? ({ "--mark": colorVar(e.color) } as React.CSSProperties) : undefined);

type Who = "both" | "me" | "them" | "ask" | "radar";

/** Who a calendar thing is for, from the viewer's side. */
function whoOf(e: CalEvent, meId: string): Who {
  const t = effectiveType(e);
  if (t === "confirmed") return "both";
  if (t === "ask") return "ask";
  if (t === "radar") return "radar";
  return e.created_by === meId ? "me" : "them";
}

/** Narrow every view by who it's for and/or its color. Nothing picked = everything. */
function CalendarFilters({ who, setWho, colors, setColors }: { who: Who[]; setWho: (w: Who[]) => void; colors: string[]; setColors: (c: string[]) => void }) {
  const { partner } = useApp();
  const labels = useColorLabels();
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const whoOptions: [Who, string][] = [
    ["both", "Both of us"],
    ["me", "Just me"],
    ["them", `Just ${partner?.display_name ?? "them"}`],
    ["ask", "Asks"],
    ["radar", "On the radar"],
  ];
  return (
    <div className="card stack-sm cal-filters">
      <div className="chips" role="group" aria-label="Filter by who">
        <span className="small muted">Who</span>
        {whoOptions.map(([k, label]) => (
          <button key={k} className="chip chip-sm" aria-pressed={who.includes(k)} onClick={() => setWho(toggle(who, k))}>
            {label}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="Filter by color">
        <span className="small muted">Color</span>
        {CAL_COLORS.map((c) => (
          <button key={c} className="chip chip-sm" aria-pressed={colors.includes(c)} onClick={() => setColors(toggle(colors, c))} aria-label={labels[c] ?? c}>
            <Swatch color={c} />
            {labels[c] && <span>{labels[c]}</span>}
          </button>
        ))}
      </div>
      {(who.length > 0 || colors.length > 0) && (
        <button className="btn-link small" style={{ alignSelf: "flex-start" }} onClick={() => (setWho([]), setColors([]))}>
          Clear filters
        </button>
      )}
    </div>
  );
}

function EventCard({ e, onOpen, showDate = false }: { e: CalEvent; onOpen: (e: CalEvent) => void; showDate?: boolean }) {
  const { meId } = useApp();
  const personColor = usePersonColor();
  const t = effectiveType(e);
  return (
    <div
      className="ev ev-card"
      data-type={t}
      data-person={personColor(e)}
      data-color={e.color ?? undefined}
      style={markStyle(e)}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(e)}
      onKeyDown={(k) => k.key === "Enter" && onOpen(e)}
    >
      <div className="row-between" style={{ alignItems: "flex-start" }}>
        <div className="grow">
          <div className="ev-title">{e.title}</div>
          <div className="ev-meta">
            {showDate && `${format(startOf(e), "EEE, MMM d")} · `}
            {whenText(e)}
            {e.series_id && " · 🔁"}
            {e.location && ` · ${e.location}`}
          </div>
        </div>
        <EventBadges e={e} />
      </div>
      {t === "ask" && e.created_by !== meId && <AskActions e={e} />}
    </div>
  );
}

/* ─── views ─────────────────────────────────────────────────────────────── */

function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Sticker name="wiley_down" size={150} tilt={-2} />
      <p className="display">{text}</p>
    </div>
  );
}

/** A birthday or holiday that day shows its emoji by the date (🎂 for birthdays). */
function dayEmoji(list: CalEvent[]) {
  for (const e of list) {
    if (!e.series_id || !e.all_day) continue;
    const m = e.title.match(/^(\p{Extended_Pictographic}\uFE0F?)/u);
    if (m) return m[1];
  }
  return null;
}

type PlanProps = { plansOn: (d: Date) => DayPlan[]; onOpenPlan: (id: string) => void; mealsOn: (d: Date) => MealTime[]; onOpenMeal: (m: MealTime) => void; extrasOn: (d: Date) => Extra[] };
/** A pin or a calendar to-do: a small thing at a time. */
type Extra = { key: string; at: string; emoji: string; text: string; when: string; done?: boolean; open: () => void };

function ExtraCard({ x }: { x: Extra }) {
  return (
    <button className={`plan-card-bg pin-card${x.done ? " done" : ""}`} onClick={x.open}>
      <span className="small muted">
        {x.emoji} {x.when}
      </span>
      <strong>{x.text}</strong>
    </button>
  );
}

/** A to-do opened from the calendar: the usual to-do editor. */
function CalTaskSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: task } = useLive<Task | null>(
    `task:${id}`,
    async () => {
      const { data } = await supabaseBrowser().from("tasks").select("*").eq("id", id).maybeSingle();
      return data as Task | null;
    },
    ["tasks"],
  );
  if (!task) return null;
  return (
    <Sheet title="Edit to-do" onClose={onClose}>
      <TaskForm initial={task} onDone={onClose} />
    </Sheet>
  );
}

const mealWhen = (m: MealTime) => timeLabel(new Date(`${m.day}T${m.at.slice(0, 5)}`));

/** A meal with a set time: "🍝 Dinner · 7 pm", and where the food stands. */
function MealCard({ m, onOpen }: { m: MealTime; onOpen: (m: MealTime) => void }) {
  const t = useMealThread(m.day, m.meal);
  return (
    <button className="plan-card-bg meal-card" onClick={() => onOpen(m)}>
      <span className="small muted">
        {MEAL_EMOJI[m.meal]} {mealWhen(m)}
      </span>
      <strong>{MEAL_LABEL[m.meal]}</strong>
      <span className="small">{t.summary ?? "Nothing picked yet."}</span>
    </button>
  );
}

function CalMealSheet({ m, onClose }: { m: MealTime; onClose: () => void }) {
  const t = useMealThread(m.day, m.meal);
  return (
    <Sheet title={`${MEAL_LABEL[m.meal]} · ${format(new Date(`${m.day}T12:00`), "EEE, MMM d")}`} onClose={onClose}>
      <MealPanel t={t} />
    </Sheet>
  );
}

/** Plans and timed meals for a day, in time order. */
function Together({ plans, meals, extras = [], onOpenPlan, onOpenMeal }: { plans: DayPlan[]; meals: MealTime[]; extras?: Extra[]; onOpenPlan: (id: string) => void; onOpenMeal: (m: MealTime) => void }) {
  const items = [
    ...plans.map((p) => ({ at: p.start_at, el: <PlanCard key={p.id} p={p} onOpen={onOpenPlan} /> })),
    ...meals.map((m) => ({ at: m.at, el: <MealCard key={m.meal} m={m} onOpen={onOpenMeal} /> })),
    ...extras.map((x) => ({ at: x.at, el: <ExtraCard key={x.key} x={x} /> })),
  ];
  return <>{items.sort((a, b) => a.at.localeCompare(b.at)).map((x) => x.el)}</>;
}

function Agenda({ events, from, to, onOpen, plansOn, onOpenPlan, mealsOn, onOpenMeal, extrasOn }: { events: CalEvent[]; from: Date; to: Date; onOpen: (e: CalEvent) => void } & PlanProps) {
  const days = useMemo(() => {
    const out: { day: Date; list: CalEvent[]; plans: DayPlan[]; meals: MealTime[]; extras: Extra[] }[] = [];
    for (const day of eachDayOfInterval({ start: from, end: to })) {
      const list = sortEvents(events.filter((e) => onDay(e, day)));
      const plans = plansOn(day);
      const meals = mealsOn(day);
      const extras = extrasOn(day);
      if (list.length || plans.length || meals.length || extras.length) out.push({ day, list, plans, meals, extras });
    }
    return out;
  }, [events, from, to, plansOn, mealsOn, extrasOn]);

  if (!days.length) return <Empty text="Wide open. Nothing planned." />;
  return (
    <div className="agenda">
      {days.map(({ day, list, plans, meals, extras }) => (
        <section key={day.toISOString()} className="agenda-day">
          <h3>
            {format(day, "EEEE, MMM d")}
            {isToday(day) && <span className="today-pill">Today</span>}
          </h3>
          <div className="stack-sm">
            {list.map((e) => (
              <EventCard key={e.id} e={e} onOpen={onOpen} />
            ))}
            <Together plans={plans} meals={meals} extras={extras} onOpenPlan={onOpenPlan} onOpenMeal={onOpenMeal} />
          </div>
        </section>
      ))}
    </div>
  );
}

function Month({ cursor, events, onOpen, onPickDay, plansOn, onOpenPlan, mealsOn, onOpenMeal, extrasOn }: { cursor: Date; events: CalEvent[]; onOpen: (e: CalEvent) => void; onPickDay: (d: Date) => void } & PlanProps) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor)), end: endOfWeek(endOfMonth(cursor)) });
  const selected = sortEvents(events.filter((e) => onDay(e, cursor)));
  const personColor = usePersonColor();
  return (
    <>
      <div className="month">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="dow">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const list = sortEvents(events.filter((e) => onDay(e, d)));
          const cls = ["mcell", !isSameMonth(d, cursor) && "other", isToday(d) && "today", isSameDay(d, cursor) && "selected"].filter(Boolean).join(" ");
          return (
            <button key={d.toISOString()} className={cls} onClick={() => onPickDay(d)} aria-label={`${format(d, "MMMM d")}, ${list.length} plans`}>
              <span className="mnum-row">
                <span className="mnum">{format(d, "d")}</span>
                {dayEmoji(list) && <span className="memoji">{dayEmoji(list)}</span>}
              </span>
              <span className="mdots">
                {list.slice(0, 3).map((e) => (
                  <i key={e.id} className="mdot ev" data-type={effectiveType(e)} data-person={personColor(e)} data-color={e.color ?? undefined} style={markStyle(e)} />
                ))}
              </span>
              {list.length > 3 && <span className="mmore">+{list.length - 3}</span>}
              {(plansOn(d).length > 0 || mealsOn(d).length > 0 || extrasOn(d).length > 0) && <span className="mplan" aria-hidden />}
            </button>
          );
        })}
      </div>
      <h3 style={{ margin: "18px 0 8px" }}>{format(cursor, "EEEE, MMM d")}</h3>
      {selected.length || plansOn(cursor).length || mealsOn(cursor).length || extrasOn(cursor).length ? (
        <div className="stack-sm">
          {selected.map((e) => (
            <EventCard key={e.id} e={e} onOpen={onOpen} />
          ))}
          <Together plans={plansOn(cursor)} meals={mealsOn(cursor)} extras={extrasOn(cursor)} onOpenPlan={onOpenPlan} onOpenMeal={onOpenMeal} />
        </div>
      ) : (
        <p className="muted">Nothing that day.</p>
      )}
    </>
  );
}

function Week({ cursor, events, onOpen, onPickDay, plansOn, onOpenPlan, mealsOn, onOpenMeal, extrasOn }: { cursor: Date; events: CalEvent[]; onOpen: (e: CalEvent) => void; onPickDay: (d: Date) => void } & PlanProps) {
  const days = eachDayOfInterval({ start: startOfWeek(cursor), end: endOfWeek(cursor) });
  return (
    <div className="card" style={{ padding: "4px 12px" }}>
      {days.map((d) => {
        const list = sortEvents(events.filter((e) => onDay(e, d)));
        return (
          <div key={d.toISOString()} className={`week-day${isToday(d) ? " today" : ""}`}>
            <button className="week-date btn-ghost" style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => onPickDay(d)}>
              <div className="w">{format(d, "EEE")}</div>
              <div className="d">{format(d, "d")}</div>
            </button>
            <div className="stack-sm">
              {list.map((e) => (
                <EventCard key={e.id} e={e} onOpen={onOpen} />
              ))}
              <Together plans={plansOn(d)} meals={mealsOn(d)} extras={extrasOn(d)} onOpenPlan={onOpenPlan} onOpenMeal={onOpenMeal} />
              {!list.length && !plansOn(d).length && !mealsOn(d).length && !extrasOn(d).length && <span className="faint small" style={{ paddingTop: 8 }}>—</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Day({ day, events, onOpen, plans, onOpenPlan, meals, onOpenMeal, extras }: { day: Date; events: CalEvent[]; onOpen: (e: CalEvent) => void; plans: DayPlan[]; onOpenPlan: (id: string) => void; meals: MealTime[]; onOpenMeal: (m: MealTime) => void; extras: Extra[] }) {
  const list = events.filter((e) => onDay(e, day));
  const personColor = usePersonColor();
  const allDay = list.filter((e) => e.all_day);
  const timed = list.filter((e) => !e.all_day).sort((a, b) => startOf(a).getTime() - startOf(b).getTime());
  const dayStart = startOfDay(day);

  const firstHour = Math.min(7, ...timed.map((e) => (startOf(e) < dayStart ? 0 : startOf(e).getHours())), ...plans.map((p) => planStart(p).getHours()), ...meals.map((m) => Number(m.at.slice(0, 2))), ...extras.map((x) => Number(x.at.slice(0, 2))));
  const hours = Array.from({ length: 24 - firstHour }, (_, i) => firstHour + i);

  // Greedy lanes so overlapping plans sit side by side.
  const lanes: Date[] = [];
  const placed = timed.map((e) => {
    const s = startOf(e) < dayStart ? dayStart : startOf(e);
    const en = new Date(Math.min(endOf(e).getTime(), endOfDay(day).getTime()));
    let lane = lanes.findIndex((end) => end <= s);
    if (lane === -1) lane = lanes.push(en) - 1;
    else lanes[lane] = en;
    return { e, s, en, lane };
  });
  const laneCount = Math.max(1, lanes.length);

  const now = new Date();
  const nowTop = isToday(day) ? (differenceInMinutes(now, dayStart) / 60 - firstHour) * HOUR_PX : null;

  return (
    <div className="dayview">
      {allDay.length > 0 && (
        <div className="allday-strip">
          {allDay.map((e) => (
            <EventCard key={e.id} e={e} onOpen={onOpen} />
          ))}
        </div>
      )}
      <div className="hours">
        {hours.map((h) => (
          <div key={h} className="hour">
            <span>{format(new Date(2000, 0, 1, h), "h a").toLowerCase()}</span>
          </div>
        ))}
        {nowTop !== null && nowTop >= 0 && <div className="nowline" style={{ top: nowTop }} />}
        {/* Plans are the backdrop: full width, faded, underneath; events overlap on top. */}
        {plans.map((p) => {
          const s = planStart(p);
          const top = (differenceInMinutes(s, dayStart) / 60 - firstHour) * HOUR_PX;
          const height = Math.max(26, (differenceInMinutes(planEnd(p), s) / 60) * HOUR_PX - 2);
          // Steps with a set time sit at their time; the rest are listed in the block.
          const loose = [...p.day_plan_items].sort((a, b) => a.position - b.position).filter((i) => !i.at_time).map((i) => i.text);
          return (
            <button key={p.id} className="plan-bg" style={{ top, height }} onClick={() => onOpenPlan(p.id)}>
              <strong>{p.title || "Time together"}</strong>
              {loose.length > 0 && <span>{loose.join(" → ")}</span>}
            </button>
          );
        })}
        {plans.flatMap((p) =>
          p.day_plan_items
            .filter((i) => i.at_time)
            .map((i) => {
              const [h, m] = i.at_time!.split(":").map(Number);
              return (
                <button key={i.id} className="step-tag" style={{ top: (h + m / 60 - firstHour) * HOUR_PX }} onClick={() => onOpenPlan(p.id)}>
                  {timeLabel(new Date(2000, 0, 1, h, m))} · {i.text}
                </button>
              );
            }),
        )}
        {/* Timed meals: a small tag at their time, on the right, above plans. */}
        {meals.map((m) => {
          const top = (Number(m.at.slice(0, 2)) + Number(m.at.slice(3, 5)) / 60 - firstHour) * HOUR_PX;
          return (
            <button key={m.meal} className="meal-tag" style={{ top }} onClick={() => onOpenMeal(m)}>
              {MEAL_EMOJI[m.meal]} {MEAL_LABEL[m.meal]} · {mealWhen(m)}
            </button>
          );
        })}
        {extras.map((x) => {
          const top = (Number(x.at.slice(0, 2)) + Number(x.at.slice(3, 5)) / 60 - firstHour) * HOUR_PX;
          return (
            <button key={x.key} className={`meal-tag pin-tag${x.done ? " done" : ""}`} style={{ top }} onClick={x.open}>
              {x.emoji} {x.text} · {x.when}
            </button>
          );
        })}
        {placed.map(({ e, s, en, lane }) => {
          const top = (differenceInMinutes(s, dayStart) / 60 - firstHour) * HOUR_PX;
          const height = Math.max(26, (differenceInMinutes(en, s) / 60) * HOUR_PX - 2);
          const t = effectiveType(e);
          return (
            <button
              key={e.id}
              className="ev dayev"
              data-type={t}
              data-person={personColor(e)}
              data-color={e.color ?? undefined}
              style={{ ...markStyle(e), top, height, left: `calc(48px + (100% - 48px) * ${lane / laneCount})`, width: `calc((100% - 48px) / ${laneCount} - 3px)`, right: "auto" }}
              onClick={() => onOpen(e)}
            >
              <strong>{e.title}</strong>
              {height > 40 && <span>{whenText(e)}</span>}
            </button>
          );
        })}
      </div>
      {list.length === 0 && plans.length === 0 && meals.length === 0 && extras.length === 0 && <p className="muted" style={{ marginTop: 12 }}>Nothing planned — a free day.</p>}
    </div>
  );
}
