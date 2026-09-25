import { addDays, startOfDay } from "date-fns";

export interface Occasion {
  id: string;
  title: string;
  emoji: string | null;
  kind: "holiday" | "birthday" | "other";
  rule: "date" | "nth";
  month: number;
  day: number | null;
  nth: number | null;
  weekday: number | null;
  note: string | null;
  series_id: string | null;
}
type Rule = Pick<Occasion, "rule" | "month" | "day" | "nth" | "weekday">;

/** The day it falls on in a given year (nth 5 = the last one that month; Feb 29 → null off leap years). */
export function dateIn(o: Rule, year: number): Date | null {
  if (o.rule === "date") {
    const d = new Date(year, o.month - 1, o.day ?? 1);
    return d.getMonth() === o.month - 1 ? d : null;
  }
  const first = new Date(year, o.month - 1, 1);
  let d = addDays(first, ((o.weekday! - first.getDay() + 7) % 7) + (Math.min(o.nth!, 5) - 1) * 7);
  if (d.getMonth() !== o.month - 1) d = addDays(d, -7);
  return d;
}

export function nextDate(o: Rule, today = new Date()): Date {
  const t = startOfDay(today);
  for (let y = t.getFullYear(); y < t.getFullYear() + 8; y++) {
    const d = dateIn(o, y);
    if (d && d >= t) return d;
  }
  return t;
}

/** The next `years` years of it, from its next time around. */
export function upcomingDates(o: Rule, years = 30, today = new Date()): Date[] {
  const first = nextDate(o, today).getFullYear();
  return Array.from({ length: years }, (_, i) => dateIn(o, first + i)).filter((d): d is Date => !!d && d >= startOfDay(today));
}

const ORD = ["1st", "2nd", "3rd", "4th", "Last"];
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const ruleText = (o: Rule) => (o.rule === "date" ? `${MON[o.month - 1]} ${o.day}` : `${ORD[o.nth! - 1]} ${WD[o.weekday!]} of ${MON[o.month - 1]}`);
export { ORD, WD, MON };

/** Common ones, one tap to add. */
export const COMMON: (Omit<Occasion, "id" | "note" | "series_id" | "kind"> & { kind?: Occasion["kind"] })[] = [
  { title: "New Year's Day", emoji: "🎆", rule: "date", month: 1, day: 1, nth: null, weekday: null },
  { title: "Valentine's Day", emoji: "💘", rule: "date", month: 2, day: 14, nth: null, weekday: null },
  { title: "St. Patrick's Day", emoji: "☘️", rule: "date", month: 3, day: 17, nth: null, weekday: null },
  { title: "Mother's Day", emoji: "💐", rule: "nth", month: 5, day: null, nth: 2, weekday: 0 },
  { title: "Memorial Day", emoji: "🇺🇸", rule: "nth", month: 5, day: null, nth: 5, weekday: 1 },
  { title: "Father's Day", emoji: "👔", rule: "nth", month: 6, day: null, nth: 3, weekday: 0 },
  { title: "Fourth of July", emoji: "🎇", rule: "date", month: 7, day: 4, nth: null, weekday: null },
  { title: "Pioneer Day", emoji: "🐂", rule: "date", month: 7, day: 24, nth: null, weekday: null },
  { title: "Labor Day", emoji: "🛠️", rule: "nth", month: 9, day: null, nth: 1, weekday: 1 },
  { title: "Halloween", emoji: "🎃", rule: "date", month: 10, day: 31, nth: null, weekday: null },
  { title: "Thanksgiving", emoji: "🦃", rule: "nth", month: 11, day: null, nth: 4, weekday: 4 },
  { title: "Christmas Eve", emoji: "🎄", rule: "date", month: 12, day: 24, nth: null, weekday: null },
  { title: "Christmas", emoji: "🎁", rule: "date", month: 12, day: 25, nth: null, weekday: null },
  { title: "New Year's Eve", emoji: "🥂", rule: "date", month: 12, day: 31, nth: null, weekday: null },
];
