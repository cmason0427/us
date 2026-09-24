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
