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
import { PlanCard, PlanSheet, createPlan, planEnd, planStart, planSteps, usePlansRange, type DayPlan } from "@/components/Plans";
import { EVENT_TYPE_LABEL, effectiveType, type CalEvent, type EventType } from "@/lib/types";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sticker } from "@/components/Sticker";
import { Sheet } from "@/components/Sheet";
import { EventForm } from "@/components/EventForm";
import { AskActions, EventBadges, EventDetail, endOf, startOf, whenText } from "@/components/EventDetail";
import { IconChevron, IconPlus, Wavy } from "@/components/Art";

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

      {view === "agenda" && <Agenda events={events} from={from} to={to} onOpen={open} plansOn={plansOn} onOpenPlan={setPlanId} />}
      {view === "month" && <Month cursor={cursor} events={events} onOpen={open} onPickDay={setCursor} plansOn={plansOn} onOpenPlan={setPlanId} />}
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
        />
      )}
      {view === "day" && <Day day={cursor} events={events} onOpen={open} plans={plansOn(cursor)} onOpenPlan={setPlanId} />}
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

type PlanProps = { plansOn: (d: Date) => DayPlan[]; onOpenPlan: (id: string) => void };

function Agenda({ events, from, to, onOpen, plansOn, onOpenPlan }: { events: CalEvent[]; from: Date; to: Date; onOpen: (e: CalEvent) => void } & PlanProps) {
  const days = useMemo(() => {
    const out: { day: Date; list: CalEvent[]; plans: DayPlan[] }[] = [];
    for (const day of eachDayOfInterval({ start: from, end: to })) {
      const list = sortEvents(events.filter((e) => onDay(e, day)));
      const plans = plansOn(day);
      if (list.length || plans.length) out.push({ day, list, plans });
    }
    return out;
  }, [events, from, to, plansOn]);

  if (!days.length) return <Empty text="Wide open. Nothing planned." />;
  return (
    <div className="agenda">
      {days.map(({ day, list, plans }) => (
        <section key={day.toISOString()} className="agenda-day">
          <h3>
            {format(day, "EEEE, MMM d")}
            {isToday(day) && <span className="today-pill">Today</span>}
          </h3>
          <div className="stack-sm">
            {list.map((e) => (
              <EventCard key={e.id} e={e} onOpen={onOpen} />
            ))}
            {plans.map((p) => (
              <PlanCard key={p.id} p={p} onOpen={onOpenPlan} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Month({ cursor, events, onOpen, onPickDay, plansOn, onOpenPlan }: { cursor: Date; events: CalEvent[]; onOpen: (e: CalEvent) => void; onPickDay: (d: Date) => void } & PlanProps) {
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
              <span className="mnum">{format(d, "d")}</span>
              <span className="mdots">
                {list.slice(0, 3).map((e) => (
                  <i key={e.id} className="mdot ev" data-type={effectiveType(e)} data-person={personColor(e)} data-color={e.color ?? undefined} style={markStyle(e)} />
                ))}
              </span>
              {list.length > 3 && <span className="mmore">+{list.length - 3}</span>}
              {plansOn(d).length > 0 && <span className="mplan" aria-hidden />}
            </button>
          );
        })}
      </div>
      <h3 style={{ margin: "18px 0 8px" }}>{format(cursor, "EEEE, MMM d")}</h3>
      {selected.length || plansOn(cursor).length ? (
        <div className="stack-sm">
          {selected.map((e) => (
            <EventCard key={e.id} e={e} onOpen={onOpen} />
          ))}
          {plansOn(cursor).map((p) => (
            <PlanCard key={p.id} p={p} onOpen={onOpenPlan} />
          ))}
        </div>
      ) : (
        <p className="muted">Nothing that day.</p>
      )}
    </>
  );
}

function Week({ cursor, events, onOpen, onPickDay, plansOn, onOpenPlan }: { cursor: Date; events: CalEvent[]; onOpen: (e: CalEvent) => void; onPickDay: (d: Date) => void } & PlanProps) {
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
              {plansOn(d).map((p) => (
                <PlanCard key={p.id} p={p} onOpen={onOpenPlan} />
              ))}
              {!list.length && !plansOn(d).length && <span className="faint small" style={{ paddingTop: 8 }}>—</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Day({ day, events, onOpen, plans, onOpenPlan }: { day: Date; events: CalEvent[]; onOpen: (e: CalEvent) => void; plans: DayPlan[]; onOpenPlan: (id: string) => void }) {
  const list = events.filter((e) => onDay(e, day));
  const personColor = usePersonColor();
  const allDay = list.filter((e) => e.all_day);
  const timed = list.filter((e) => !e.all_day).sort((a, b) => startOf(a).getTime() - startOf(b).getTime());
  const dayStart = startOfDay(day);

  const firstHour = Math.min(7, ...timed.map((e) => (startOf(e) < dayStart ? 0 : startOf(e).getHours())), ...plans.map((p) => planStart(p).getHours()));
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
          const steps = planSteps(p);
          return (
            <button key={p.id} className="plan-bg" style={{ top, height }} onClick={() => onOpenPlan(p.id)}>
              <strong>{p.title || "Time together"}</strong>
              {steps.length > 0 && <span>{steps.join(" → ")}</span>}
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
      {list.length === 0 && plans.length === 0 && <p className="muted" style={{ marginTop: 12 }}>Nothing planned — a free day.</p>}
    </div>
  );
}
