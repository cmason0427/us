"use client";

import { useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { Sheet } from "./Sheet";
import { IconChevron } from "./Art";

/**
 * Day + time, picked together. Collapsed it's one quiet line ("Sat, Sep 26 ·
 * 1–5 pm", or "Set day and time"); tap it for a small calendar and the times,
 * then Done.
 *
 *   date     yyyy-MM-dd
 *   endDate  yyyy-MM-dd (all-day spans; timed ends past midnight)
 *   start/end HH:mm ("" = no time)
 */
export interface When {
  date: string;
  endDate?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
}

type Mode =
  | "range" // an event: start–end, optional all day (multi-day)
  | "point" // a day and a start time, no end
  | "deadline"; // a day, time optional ("by end of day")

const hm = (t?: string) => (t ? format(parseISO(`2000-01-01T${t}`), parseISO(`2000-01-01T${t}`).getMinutes() ? "h:mm" : "h") : "");
const ampm = (t?: string) => (t ? format(parseISO(`2000-01-01T${t}`), "a").toLowerCase() : "");

function timeRange(start?: string, end?: string) {
  if (!start) return "";
  if (!end) return `${hm(start)} ${ampm(start)}`;
  return ampm(start) === ampm(end) ? `${hm(start)}–${hm(end)} ${ampm(end)}` : `${hm(start)} ${ampm(start)}–${hm(end)} ${ampm(end)}`;
}

export function whenLabel(v: When | null, mode: Mode = "range") {
  if (!v?.date) return null;
  const d = parseISO(v.date);
  const day = format(d, "EEE, MMM d");
  if (mode === "deadline") return v.start ? `${day}, by ${hm(v.start)} ${ampm(v.start)}` : `${day}, end of day`;
  if (v.allDay) {
    if (v.endDate && v.endDate > v.date) return `${day} – ${format(parseISO(v.endDate), "EEE, MMM d")} · all day`;
    return `${day} · all day`;
  }
  return `${day} · ${timeRange(v.start, mode === "range" ? v.end : undefined)}`;
}

export function WhenPicker({
  value,
  onChange,
  mode = "range",
  placeholder = "Set day and time",
  allowAllDay = mode === "range",
}: {
  value: When | null;
  onChange: (v: When) => void;
  mode?: Mode;
  placeholder?: string;
  allowAllDay?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = whenLabel(value, mode);
  return (
    <>
      <button type="button" className="when-line" onClick={() => setOpen(true)}>
        <span className={label ? "" : "muted"}>{label ?? placeholder}</span>
        <span className="when-icon" aria-hidden>
          📅
        </span>
      </button>
      {open && (
        <WhenSheet
          initial={value ?? { date: format(new Date(), "yyyy-MM-dd") }}
          mode={mode}
          allowAllDay={allowAllDay}
          onClose={() => setOpen(false)}
          onDone={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function WhenSheet({ initial, mode, allowAllDay, onClose, onDone }: { initial: When; mode: Mode; allowAllDay: boolean; onClose: () => void; onDone: (v: When) => void }) {
  const [v, setV] = useState<When>(initial);
  const [month, setMonth] = useState(() => startOfMonth(parseISO(initial.date)));
  const days = eachDayOfInterval({ start: startOfWeek(month), end: endOfWeek(endOfMonth(month)) });
  const allDay = !!v.allDay;

  function pickDay(d: string) {
    // All day: a second tap on a later day makes it multi-day.
    if (allDay && v.date && (!v.endDate || v.endDate === v.date) && d > v.date) return setV({ ...v, endDate: d });
    setV({ ...v, date: d, endDate: d });
  }

  const inSpan = (d: string) => allDay && v.endDate && d >= v.date && d <= v.endDate;

  // Timed events that end "before" they start run past midnight.
  function done() {
    const out: When = { ...v };
    if (!out.allDay && mode === "range" && out.start && out.end) out.endDate = out.end <= out.start ? format(addDays(parseISO(out.date), 1), "yyyy-MM-dd") : out.date;
    if (!out.endDate || out.endDate < out.date) out.endDate = out.date;
    onDone(out);
  }

  return (
    <Sheet title={mode === "deadline" ? "When's it due?" : "Day and time"} onClose={onClose}>
      <div className="stack">
        <div className="mini-cal">
          <div className="row-between">
            <button type="button" className="icon-btn" onClick={() => setMonth((m) => subMonths(m, 1))} aria-label="Previous month">
              <IconChevron dir="left" />
            </button>
            <strong>{format(month, "MMMM yyyy")}</strong>
            <button type="button" className="icon-btn" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
              <IconChevron />
            </button>
          </div>
          <div className="mini-grid">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i} className="mini-dow">
                {d}
              </span>
            ))}
            {days.map((d) => {
              const key = format(d, "yyyy-MM-dd");
              const cls = ["mini-day", !isSameMonth(d, month) && "other", isToday(d) && "today", key === v.date && "on", inSpan(key) && "span", allDay && key === v.endDate && "on"]
                .filter(Boolean)
                .join(" ");
              return (
                <button type="button" key={key} className={cls} onClick={() => pickDay(key)} aria-label={format(d, "EEEE, MMMM d")} aria-pressed={key === v.date}>
                  {format(d, "d")}
                </button>
              );
            })}
          </div>
        </div>

        {allowAllDay && (
          <div className="toggle-row">
            <span className="label">All day</span>
            <label className="switch">
              <input type="checkbox" checked={allDay} onChange={(e) => setV({ ...v, allDay: e.target.checked, endDate: v.date })} />
              <span />
            </label>
          </div>
        )}
        {allDay && <p className="small muted">Tap a later day to make it span several days.</p>}

        {!allDay && (
          <div className="time-row">
            <label className="time-field">
              <span>{mode === "deadline" ? "By (optional)" : "Starts"}</span>
              <input type="time" value={v.start ?? ""} onChange={(e) => setV({ ...v, start: e.target.value })} />
            </label>
            {mode === "range" && (
              <label className="time-field">
                <span>Ends</span>
                <input type="time" value={v.end ?? ""} onChange={(e) => setV({ ...v, end: e.target.value })} />
              </label>
            )}
            {mode === "deadline" && v.start && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setV({ ...v, start: "" })}>
                End of day
              </button>
            )}
          </div>
        )}

        <div className="when-preview small muted">{whenLabel(v, mode)}</div>
        <button type="button" className="btn btn-primary btn-block" onClick={done} disabled={!v.date || (mode === "range" && !allDay && !v.start)}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
