import { addDays, addMonths, addWeeks, differenceInCalendarDays, endOfMonth, format, getDay, parseISO, startOfDay, startOfMonth } from "date-fns";

// Personal money math. Everything here is pure (no database), so the page
// just loads rows and asks: what's safe to spend, what to set aside, when.

export type IncomeFreq = "weekly" | "biweekly" | "semimonthly" | "monthly";
export type BillFreq = "monthly" | "weekly" | "biweekly" | "quarterly" | "yearly";

export interface Income {
  id: string;
  name: string;
  amount: number;
  freq: IncomeFreq;
  anchor: string; // a real payday, yyyy-MM-dd
  day2: number | null; // semimonthly: the second day of the month
}
export interface Paycheck {
  id: string;
  income_id: string | null;
  paid_on: string;
  amount: number;
}
export interface Bill {
  id: string;
  name: string;
  emoji: string | null;
  amount: number;
  freq: BillFreq;
  anchor: string; // a due date
  autopay: boolean;
  created_at?: string;
}
export interface Category {
  id: string;
  name: string;
  emoji: string | null;
  ceiling: number | null; // per month
  warn_pct: number;
  position: number;
}
export interface Spend {
  id: string;
  category_id: string | null;
  amount: number;
  note: string | null;
  spent_on: string;
}
export interface Settings {
  save_pct: number;
  save_fixed: number;
  cushion: number;
}
export const DEFAULT_SETTINGS: Settings = { save_pct: 10, save_fixed: 0, cushion: 0 };

export const iso = (d: Date) => format(d, "yyyy-MM-dd");
export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export const money2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Day `day` of the month `m`, clamped (the 31st in a 30-day month is the 30th). */
function dayOf(m: Date, day: number) {
  const last = endOfMonth(m).getDate();
  return new Date(m.getFullYear(), m.getMonth(), Math.min(day, last));
}

/** Every date a schedule lands on between from and to (inclusive), counted from its anchor. */
function schedule(anchorIso: string, freq: IncomeFreq | BillFreq, from: Date, to: Date, day2?: number | null): Date[] {
  const anchor = parseISO(anchorIso);
  const out: Date[] = [];
  if (freq === "weekly" || freq === "biweekly") {
    const step = freq === "weekly" ? 1 : 2;
    // Jump to just before `from`, then walk forward.
    const weeks = Math.floor(differenceInCalendarDays(from, anchor) / 7 / step) * step;
    for (let d = addWeeks(anchor, weeks - step); d <= to; d = addWeeks(d, step)) if (d >= from) out.push(d);
    return out;
  }
  const months = freq === "quarterly" ? 3 : freq === "yearly" ? 12 : 1;
  const days = freq === "semimonthly" ? [anchor.getDate(), day2 ?? 15] : [anchor.getDate()];
  for (let m = startOfMonth(from); m <= to; m = addMonths(m, 1)) {
    const gap = (m.getFullYear() - anchor.getFullYear()) * 12 + (m.getMonth() - anchor.getMonth());
    if (gap % months !== 0) continue;
    for (const day of days) {
      const d = dayOf(m, day);
      if (d >= from && d <= to) out.push(d);
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

export const payDates = (i: Income, from: Date, to: Date) => schedule(i.anchor, i.freq, from, to, i.day2);
export const dueDates = (b: Bill, from: Date, to: Date) => schedule(b.anchor, b.freq, from, to);

/** Paychecks per year, for "about $X a month". */
const PER_YEAR: Record<IncomeFreq, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
const BILL_PER_YEAR: Record<BillFreq, number> = { weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, yearly: 1 };
export const monthlyIncome = (list: Income[]) => list.reduce((s, i) => s + (i.amount * PER_YEAR[i.freq]) / 12, 0);
export const monthlyBills = (list: Bill[]) => list.reduce((s, b) => s + (b.amount * BILL_PER_YEAR[b.freq]) / 12, 0);

export interface Period {
  start: Date;
  end: Date; // the next payday (exclusive)
  income: number;
  paychecks: { name: string; amount: number; actual: boolean }[];
  bills: { bill: Bill; due: Date; paid: boolean }[];
  billTotal: number; // unpaid bills due this period
  savings: number;
  budgets: number; // category ceilings, prorated to this period's length
  setAside: number; // held back now for a later, tighter paycheck
  fromEarlier: number; // covered by money set aside earlier
  free: number; // fun money for this period
  held: number; // total sitting aside after this paycheck
}

export interface Plan {
  periods: Period[];
  current: Period | null;
  shortfall: number; // current paycheck can't cover what's due, even with nothing fun
}

/**
 * Walks the next few pay periods: each paycheck pays the bills due before the
 * next one, savings come off the top, category budgets are set aside for the
 * days they cover, and whatever's left is fun money. If a later paycheck can't
 * cover its bills, the gap is set aside from earlier ones automatically.
 */
export function buildPlan(opts: {
  incomes: Income[];
  paychecks: Paycheck[];
  bills: Bill[];
  paid: Set<string>; // `${bill_id}:${yyyy-MM-dd}`
  categories: Category[];
  settings: Settings;
  today?: Date;
  count?: number;
}): Plan {
  const today = startOfDay(opts.today ?? new Date());
  const { incomes, bills, settings } = opts;
  if (!incomes.length) return { periods: [], current: null, shortfall: 0 };

  // Paydays from a bit back (to find the one we're in) to ~4 months out.
  const from = addDays(today, -35);
  const to = addDays(today, 130);
  const byDay = new Map<string, Period["paychecks"]>();
  for (const i of incomes) {
    for (const d of payDates(i, from, to)) {
      const actual = opts.paychecks.find((p) => p.income_id === i.id && p.paid_on === iso(d));
      const list = byDay.get(iso(d)) ?? [];
      list.push({ name: i.name, amount: actual ? Number(actual.amount) : Number(i.amount), actual: !!actual });
      byDay.set(iso(d), list);
    }
  }
  const days = [...byDay.keys()].sort();
  const firstIdx = Math.max(0, days.findLastIndex((d) => d <= iso(today)));
  const monthlyBudgets = opts.categories.reduce((s, c) => s + Number(c.ceiling ?? 0), 0);
  const periods: Period[] = [];
  for (let k = firstIdx; k < days.length - 1 && periods.length < (opts.count ?? 8); k++) {
    const start = parseISO(days[k]);
    const end = parseISO(days[k + 1]);
    const paychecks = byDay.get(days[k])!;
    const income = paychecks.reduce((s, p) => s + p.amount, 0);
    const due = bills
      // A due date from before you added the bill was already handled some other way.
      .flatMap((b) => dueDates(b, start, addDays(end, -1)).filter((d) => !b.created_at || iso(d) >= b.created_at.slice(0, 10)).map((d) => ({ bill: b, due: d, paid: opts.paid.has(`${b.id}:${iso(d)}`) })))
      .sort((a, b) => a.due.getTime() - b.due.getTime());
    const billTotal = due.filter((x) => !x.paid).reduce((s, x) => s + Number(x.bill.amount), 0);
    const savings = Math.round((income * Number(settings.save_pct)) / 100 + Number(settings.save_fixed));
    const budgets = Math.round((monthlyBudgets * differenceInCalendarDays(end, start)) / 30.44);
    periods.push({ start, end, income, paychecks, bills: due, billTotal, savings, budgets, setAside: 0, fromEarlier: 0, held: 0, free: income - billTotal - savings - budgets });
  }
  // Tight paychecks borrow from earlier ones: walk backwards, pushing any gap onto the one before.
  for (let k = periods.length - 1; k > 0; k--) {
    const p = periods[k];
    if (p.free < 0) {
      const gap = -p.free;
      p.fromEarlier += gap;
      p.free = 0;
      periods[k - 1].setAside += gap;
      periods[k - 1].free -= gap;
    }
  }
  // Can this paycheck even cover what's due? (Checked before evening out.)
  const shortfall = periods[0] && periods[0].free < 0 ? Math.round(-periods[0].free) : 0;
  // Then even it out: every paycheck gets about the same fun money, with the
  // extra from roomy paychecks held for the lean ones (rent weeks).
  if (periods.length > 1) {
    const target = periods.reduce((s, p) => s + Math.max(0, p.free), 0) / periods.length;
    let held = 0;
    for (const p of periods) {
      const avail = p.free + held;
      const give = Math.max(0, Math.min(target, avail));
      const next = Math.max(0, avail - give);
      // Positive: put this much aside now. Negative: this paycheck leans on what was held.
      p.setAside += Math.max(0, next - held);
      p.fromEarlier += Math.max(0, held - next);
      p.held = next;
      p.free = give;
      held = next;
    }
  }
  for (const p of periods) {
    p.free = Math.round(p.free);
    p.setAside = Math.round(p.setAside);
    p.fromEarlier = Math.round(p.fromEarlier);
    p.held = Math.round(p.held);
  }
  const current = periods[0] ?? null;
  return { periods, current, shortfall };
}

/** What's left to spend this period after what you've already spent outside category budgets. */
export function safeToSpend(current: Period | null, spends: Spend[], cushion: number, today = new Date()) {
  if (!current) return null;
  const inPeriod = spends.filter((s) => s.spent_on >= iso(current.start) && s.spent_on < iso(current.end));
  const funSpent = inPeriod.filter((s) => !s.category_id).reduce((a, s) => a + Number(s.amount), 0);
  const left = Math.max(0, current.free - funSpent - cushion);
  const daysLeft = Math.max(1, differenceInCalendarDays(current.end, startOfDay(today)));
  return { left, perDay: left / daysLeft, daysLeft, funSpent };
}

/** This month per category: spent, ceiling, and whether it's close or over. */
export function categoryStatus(categories: Category[], spends: Spend[], today = new Date()) {
  const m0 = iso(startOfMonth(today));
  const m1 = iso(endOfMonth(today));
  return categories.map((c) => {
    const spent = spends.filter((s) => s.category_id === c.id && s.spent_on >= m0 && s.spent_on <= m1).reduce((a, s) => a + Number(s.amount), 0);
    const ceiling = c.ceiling != null ? Number(c.ceiling) : null;
    const pct = ceiling ? (spent / ceiling) * 100 : 0;
    return { c, spent, ceiling, pct, state: ceiling == null ? "track" : pct >= 100 ? "over" : pct >= c.warn_pct ? "close" : "ok" };
  });
}

/** "You tend to spend on Fridays and Saturdays" from the last ~3 months. */
export function spendingDays(spends: Spend[], today = new Date()) {
  const since = iso(addDays(today, -90));
  if (spends.filter((s) => s.spent_on >= since).length < 6) return null; // not enough to call it a pattern
  const byDay = [0, 0, 0, 0, 0, 0, 0];
  for (const s of spends) if (s.spent_on >= since) byDay[getDay(parseISO(s.spent_on))] += Number(s.amount);
  const total = byDay.reduce((a, b) => a + b, 0);
  if (total < 1) return null;
  const names = ["sundays", "mondays", "tuesdays", "wednesdays", "thursdays", "fridays", "saturdays"];
  const top = byDay
    .map((v, i) => ({ i, v }))
    .sort((a, b) => b.v - a.v)
    .filter((x) => x.v / total >= 0.2)
    .slice(0, 2);
  return top.length ? { days: top.map((t) => names[t.i]), share: Math.round((top.reduce((a, t) => a + t.v, 0) / total) * 100) } : null;
}
