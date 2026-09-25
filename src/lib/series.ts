import { addDays, addMonths, addWeeks, differenceInCalendarDays, getDate, getDay, startOfMonth } from "date-fns";

export type Freq = "weekly" | "biweekly" | "monthly_date" | "monthly_weekday";

export const FREQ_LABEL: Record<Freq, string> = {
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  monthly_date: "Every month (same date)",
  monthly_weekday: "Every month (same weekday)",
};

const ORD = ["1st", "2nd", "3rd", "4th", "last"];
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "2nd Tue" for monthly-by-weekday. */
export const weekdayOrdinal = (d: Date) => `${ORD[Math.floor((getDate(d) - 1) / 7)]} ${DAY[getDay(d)]}`;

/** The nth `weekday` of a month; n = 5 means the last one (every month has a last Tuesday). */
function nthWeekday(month: Date, weekday: number, n: number) {
  const first = startOfMonth(month);
  const d = addDays(first, ((weekday - getDay(first) + 7) % 7) + (Math.min(n, 5) - 1) * 7);
  if (n < 5) return d;
  return d.getMonth() === first.getMonth() ? d : addDays(d, -7);
}

/** Every occurrence start from `start` through `until` (inclusive), at most 60. */
export function occurrences(start: Date, freq: Freq, until: Date): Date[] {
  const out: Date[] = [];
  const n = Math.floor((getDate(start) - 1) / 7) + 1;
  for (let i = 0; out.length < 60; i++) {
    let d: Date | null;
    if (freq === "weekly") d = addWeeks(start, i);
    else if (freq === "biweekly") d = addWeeks(start, i * 2);
    else if (freq === "monthly_date") {
      d = addMonths(start, i);
      if (getDate(d) !== getDate(start)) continue; // no 31st this month
    } else {
      const m = nthWeekday(addMonths(startOfMonth(start), i), getDay(start), n);
      d = m ? setTime(m, start) : null;
      if (!d) continue;
    }
    if (differenceInCalendarDays(d, until) > 0) break;
    out.push(d);
    if (i > 400) break;
  }
  return out;
}

const setTime = (day: Date, time: Date) => {
  const d = new Date(day);
  d.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return d;
};
