import { differenceInCalendarDays, endOfDay, format, isToday, isTomorrow } from "date-fns";
import { timeLabel } from "./dates";

export interface Deadline {
  due_at: string;
  due_all_day: boolean;
}

/** "By end of <day>": the last minute of that local day. */
export const endOfDayDeadline = (day: Date): Deadline => ({ due_at: endOfDay(day).toISOString(), due_all_day: true });

export const isOverdue = (t: { due_at: string | null; done: boolean }, now = Date.now()) =>
  !t.done && t.due_at !== null && new Date(t.due_at).getTime() < now;

/** "by end of today", "due 5pm", "due Thu 5pm", "was due yesterday"… */
export function dueLabel(d: Deadline, now = new Date()) {
  const at = new Date(d.due_at);
  const day = isToday(at) ? "today" : isTomorrow(at) ? "tomorrow" : Math.abs(differenceInCalendarDays(at, now)) < 6 ? format(at, "EEE") : format(at, "MMM d");
  if (at < now) {
    const yesterday = differenceInCalendarDays(now, at) === 1;
    const when = d.due_all_day ? (yesterday ? "yesterday" : day) : `${yesterday ? "yesterday" : day === "today" ? "" : `${day} `}${timeLabel(at)}`.trim();
    return `was due ${when}`;
  }
  if (d.due_all_day) return `by end of ${day}`;
  return `due ${day === "today" ? "" : `${day} `}${timeLabel(at)}`;
}

/**
 * Scheduled to-dos (a time window, like the daily dog ones) stay out of sight
 * until an hour before the window opens, so the list isn't full of dinner at 8am.
 */
export function hiddenUntil(t: { window_start: string | null; due_at: string | null }): number | null {
  if (!t.window_start || !t.due_at) return null;
  const [h, m] = t.window_start.slice(0, 5).split(":").map(Number);
  const open = new Date(t.due_at);
  open.setHours(h, m, 0, 0);
  return open.getTime() - 60 * 60 * 1000;
}
export const isHiddenNow = (t: { window_start: string | null; due_at: string | null; done: boolean }, now: number) => {
  const until = hiddenUntil(t);
  return !t.done && until != null && now > 0 && now < until;
};
