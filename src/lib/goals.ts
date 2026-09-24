import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

export type GoalMode = "plan" | "total" | "habit";
export type WhenKind = "none" | "date" | "range";

export interface Goal {
  id: string;
  name: string;
  emoji: string | null;
  shared: boolean;
  owner: string | null;
  mode: GoalMode;
  target_amount: number | null;
  habit_amount: number | null;
  when_kind: WhenKind;
  target_date: string | null;
  range_from_days: number | null;
  range_to_days: number | null;
  propose: boolean;
  checkin_days: number | null;
  start_date: string;
  track: boolean;
  archived_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  goal_items: GoalItem[];
}
export interface GoalItem {
  id: string;
  label: string;
  amount: number;
  position: number;
}
export interface GoalLog {
  id: string;
  goal_id: string;
  kind: "add" | "withdraw" | "balance" | "skip";
  amount: number;
  checkin_for: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
}

/** "Happening in…" presets, in days. */
export const RANGES: { label: string; from: number; to: number }[] = [
  { label: "1–3 weeks", from: 7, to: 21 },
  { label: "1–2 months", from: 30, to: 61 },
  { label: "3–6 months", from: 91, to: 183 },
  { label: "6 months–1 year", from: 183, to: 365 },
  { label: "1–2 years", from: 365, to: 730 },
];

export const CHECKIN_OPTIONS: { days: number; label: string; unit: string }[] = [
  { days: 7, label: "Every week", unit: "week" },
  { days: 14, label: "Every 2 weeks", unit: "2 weeks" },
  { days: 30, label: "Every month", unit: "month" },
  { days: 91, label: "Every 3 months", unit: "3 months" },
];

export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 });

export const goalTotal = (g: Pick<Goal, "mode" | "target_amount" | "goal_items">) =>
  g.mode === "plan" ? g.goal_items.reduce((s, i) => s + Number(i.amount || 0), 0) : g.mode === "total" ? Number(g.target_amount ?? 0) : 0;

/** What's saved: the latest "account is at $X", plus adds and minus withdrawals since. */
export function goalBalance(logs: GoalLog[]) {
  const sorted = [...logs].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let bal = 0;
  for (const l of sorted) {
    if (l.kind === "balance") bal = Number(l.amount);
    else if (l.kind === "add") bal += Number(l.amount);
    else if (l.kind === "withdraw") bal -= Number(l.amount);
  }
  return bal;
}

/** The days left until it happens: the date, or both ends of a range (counted from when the goal started). */
export function daysLeft(g: Goal, today: Date): { soon: number; late: number } | null {
  if (g.when_kind === "date" && g.target_date) {
    const d = differenceInCalendarDays(parseISO(g.target_date), today);
    return { soon: d, late: d };
  }
  if (g.when_kind === "range" && g.range_from_days != null && g.range_to_days != null) {
    const start = parseISO(g.start_date);
    return {
      soon: differenceInCalendarDays(addDays(start, g.range_from_days), today),
      late: differenceInCalendarDays(addDays(start, g.range_to_days), today),
    };
  }
  return null;
}

/** How often to check in: what they picked, else weekly for anything under ~2 months, monthly after. */
export function checkinDays(g: Goal, today: Date) {
  if (g.checkin_days) return g.checkin_days;
  if (g.mode === "habit") return 30;
  const left = daysLeft(g, today);
  return left && left.late <= 62 ? 7 : 30;
}

export const unitName = (days: number) => CHECKIN_OPTIONS.find((o) => o.days === days)?.unit ?? `${days} days`;

/** How much to put away each check-in to make it in time (null when there's no timeline or nothing left). */
export function perCheckin(remaining: number, days: number, every: number) {
  if (remaining <= 0) return 0;
  const n = Math.max(1, Math.ceil(days / every));
  return Math.ceil((remaining / n) * 100) / 100;
}

/** Check-in due dates: every `every` days from the start, up to today. */
export function latestDue(g: Goal, today: Date): string | null {
  const start = parseISO(g.start_date);
  const every = checkinDays(g, today);
  const since = differenceInCalendarDays(today, start);
  if (since < every) return null; // the first one comes one step after starting
  const k = Math.floor(since / every);
  return format(addDays(start, k * every), "yyyy-MM-dd");
}

export interface GoalPlan {
  total: number;
  saved: number | null; // null when this goal doesn't track money
  remaining: number;
  every: number; // check-in spacing, days
  /** Suggested amount per check-in: [sooner, later] ends (equal for a date). */
  suggest: [number, number] | null;
  /** A check-in waiting for an answer, with how much it's asking about. */
  due: { date: string; amount: number } | null;
  met: boolean;
}

export function planGoal(g: Goal, logs: GoalLog[], today: Date): GoalPlan {
  const total = goalTotal(g);
  const saved = g.track ? goalBalance(logs) : null;
  const remaining = Math.max(0, total - (saved ?? 0));
  const every = checkinDays(g, today);
  const left = daysLeft(g, today);
  const suggest: [number, number] | null =
    g.mode !== "habit" && g.propose && left && total > 0
      ? [perCheckin(remaining, Math.max(left.soon, every), every), perCheckin(remaining, Math.max(left.late, every), every)]
      : null;
  const met = g.mode !== "habit" && total > 0 && saved !== null && saved >= total;

  // Ask "did you add it?" only for tracked goals that have an amount to ask about.
  let due: GoalPlan["due"] = null;
  const amount = g.mode === "habit" ? Number(g.habit_amount ?? 0) : suggest ? suggest[1] : 0;
  if (g.track && !g.archived_at && !met && amount > 0) {
    const date = latestDue(g, today);
    if (date && !logs.some((l) => l.checkin_for === date)) due = { date, amount };
  }
  return { total, saved, remaining, every, suggest, due, met };
}
