import { addDays, addMonths, addWeeks, differenceInCalendarDays, endOfMonth, format, getDay, parseISO, startOfDay, startOfMonth } from "date-fns";

// Personal money math. Everything here is pure (no database), so the page
// just loads rows and asks: what's safe to spend, what to set aside, when.

export type IncomeFreq = "weekly" | "biweekly" | "semimonthly" | "monthly";
export type BillFreq = "monthly" | "weekly" | "biweekly" | "quarterly" | "yearly";

export interface Income {
  id: string;
  name: string;
  amount: number; // the low end if pay varies (what we plan on)
  amount_max?: number | null; // commission / performance: the high end
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
  created_at?: string;
}
/** A one-time thing: extra money in (bonus, a sale) or a surprise bill. */
export interface OneOff {
  id: string;
  kind: "in" | "out";
  name: string;
  amount: number;
  on_date: string;
}
export interface Balance {
  id: string;
  amount: number;
  as_of: string;
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
export const monthlyIncome = (list: Income[]) => list.reduce((s, i) => s + (Number(i.amount) * PER_YEAR[i.freq]) / 12, 0);
export const monthlyIncomeMax = (list: Income[]) => list.reduce((s, i) => s + (Number(i.amount_max ?? i.amount) * PER_YEAR[i.freq]) / 12, 0);
export const monthlyBills = (list: Bill[]) => list.reduce((s, b) => s + (b.amount * BILL_PER_YEAR[b.freq]) / 12, 0);

export interface Period {
  start: Date;
  end: Date; // the next payday (exclusive)
  income: number;
  paychecks: { name: string; amount: number; actual: boolean; max: number | null }[];
  incomeMax: number; // if variable pay comes in at the top of its range
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
  oneoffs?: OneOff[];
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
      // Variable pay is planned at its low end, so a slow week never overspends; log what actually landed.
      list.push({ name: i.name, amount: actual ? Number(actual.amount) : Number(i.amount), actual: !!actual, max: !actual && i.amount_max ? Number(i.amount_max) : null });
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
    const inRange = (o: OneOff) => o.on_date >= days[k] && o.on_date < days[k + 1];
    const extra = (opts.oneoffs ?? []).filter((o) => o.kind === "in" && inRange(o));
    const paychecks = [...byDay.get(days[k])!, ...extra.map((o) => ({ name: `➕ ${o.name}`, amount: Number(o.amount), actual: true, max: null }))];
    const income = paychecks.reduce((s, p) => s + p.amount, 0);
    const incomeMax = paychecks.reduce((s, p) => s + (p.max ?? p.amount), 0);
    const due = bills
      // A due date from before you added the bill was already handled some other way.
      .flatMap((b) => dueDates(b, start, addDays(end, -1)).filter((d) => !b.created_at || iso(d) >= b.created_at.slice(0, 10)).map((d) => ({ bill: b, due: d, paid: opts.paid.has(`${b.id}:${iso(d)}`) })))
      // Surprise bills count like any bill due in this stretch.
      .concat(
        (opts.oneoffs ?? [])
          .filter((o) => o.kind === "out" && inRange(o))
          .map((o) => ({ bill: { id: `oneoff:${o.id}`, name: o.name, emoji: "⚡", amount: Number(o.amount), freq: "monthly" as BillFreq, anchor: o.on_date, autopay: false }, due: parseISO(o.on_date), paid: false })),
      )
      .sort((a, b) => a.due.getTime() - b.due.getTime());
    const billTotal = due.filter((x) => !x.paid).reduce((s, x) => s + Number(x.bill.amount), 0);
    const savings = Math.round((income * Number(settings.save_pct)) / 100 + Number(settings.save_fixed));
    const budgets = Math.round((monthlyBudgets * differenceInCalendarDays(end, start)) / 30.44);
    periods.push({ start, end, income, incomeMax, paychecks, bills: due, billTotal, savings, budgets, setAside: 0, fromEarlier: 0, held: 0, free: income - billTotal - savings - budgets });
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

/**
 * "My account has $X right now." When you check in a balance since the last
 * payday, it wins over the tracked math (it catches purchases you forgot to
 * log): balance − anything logged after it − bills still due before payday −
 * what this paycheck should put aside − what's left in category budgets − the
 * cushion = safe to spend.
 */
export function fromBalance(balance: Balance | undefined, current: Period | null, spends: Spend[], cushion: number, today = new Date()) {
  if (!balance || !current) return null;
  const asOf = new Date(balance.as_of);
  if (asOf < current.start) return null; // from before this paycheck landed; ask for a fresh one
  const t = iso(today);
  const spentSince = spends.filter((s) => (s.created_at ? new Date(s.created_at) > asOf : s.spent_on > iso(asOf))).reduce((a, s) => a + Number(s.amount), 0);
  const billsLeft = current.bills.filter((b) => !b.paid && iso(b.due) >= t).reduce((a, b) => a + Number(b.bill.amount), 0);
  const inPeriod = spends.filter((s) => s.spent_on >= iso(current.start) && s.spent_on < iso(current.end));
  const catSpent = inPeriod.filter((s) => s.category_id).reduce((a, s) => a + Number(s.amount), 0);
  const budgetsLeft = Math.max(0, current.budgets - catSpent);
  const reserved = billsLeft + current.setAside + budgetsLeft + cushion;
  const left = Math.max(0, Number(balance.amount) - spentSince - reserved);
  const daysLeft = Math.max(1, differenceInCalendarDays(current.end, startOfDay(today)));
  return { left, perDay: left / daysLeft, daysLeft, asOf, billsLeft, budgetsLeft, setAside: current.setAside, spentSince };
}

/**
 * Your account balance right now, from the last check-in: minus what you've
 * logged since, plus any paydays or extra money that have already landed.
 * Nothing that hasn't arrived yet is counted.
 */
export function balanceNow(opts: { balance: Balance | undefined; spends: Spend[]; incomes: Income[]; paychecks: Paycheck[]; oneoffs: OneOff[]; today?: Date }) {
  const { balance } = opts;
  if (!balance) return null;
  const asOf = new Date(balance.as_of);
  const today = opts.today ?? new Date();
  const spent = opts.spends.filter((s) => (s.created_at ? new Date(s.created_at) > asOf : s.spent_on > iso(asOf))).reduce((a, s) => a + Number(s.amount), 0);
  let landed = 0;
  for (const i of opts.incomes) {
    for (const d of payDates(i, addDays(startOfDay(asOf), 1), today)) {
      const actual = opts.paychecks.find((p) => p.income_id === i.id && p.paid_on === iso(d));
      landed += actual ? Number(actual.amount) : Number(i.amount);
    }
  }
  landed += opts.oneoffs.filter((o) => o.kind === "in" && o.on_date > iso(asOf) && o.on_date <= iso(today)).reduce((a, o) => a + Number(o.amount), 0);
  return { now: Number(balance.amount) - spent + landed, checked: Number(balance.amount), asOf, spent, landed };
}

export interface FloorPlan {
  start: number; // where the projection starts (real balance, or this paycheck minus spending)
  fromBalance: boolean;
  left: number; // safe to spend before the next payday
  perDay: number;
  daysLeft: number;
  nextPay: Date | null;
  low: { at: Date; amount: number; after: string } | null; // the tightest spot ahead
  funByPeriod: Map<string, number>; // payday → fun money for that paycheck
  comingThisMonth: { paychecks: number; extra: number; items: { name: string; amount: number; on: Date; extra: boolean }[] };
}

/**
 * The balance-floor plan: walk the account forward day by day (what's there
 * now, + each paycheck and extra money on the day it lands, − each bill and
 * surprise bill on its due date, − savings and category budgets as each
 * paycheck arrives). Safe to spend now is how far the lowest point ahead sits
 * above your floor, so you never dip below it, and money that hasn't landed
 * is only counted from the day it lands. Each later paycheck gets the same
 * treatment after earlier fun money is taken out.
 */
export function floorPlan(opts: {
  plan: Plan;
  incomes: Income[];
  paychecks: Paycheck[];
  oneoffs: OneOff[];
  spends: Spend[];
  categories: Category[];
  settings: Settings;
  balance: ReturnType<typeof balanceNow>;
  today?: Date;
}): FloorPlan | null {
  const { plan } = opts;
  const cur = plan.current;
  if (!cur) return null;
  const today = startOfDay(opts.today ?? new Date());
  const t = iso(today);
  const floor = Number(opts.settings.cushion) || 0;

  // Starting point: a real balance if you've checked one in since this paycheck, else this paycheck minus what's gone out.
  let start: number;
  let fromBalance = false;
  if (opts.balance && opts.balance.asOf >= cur.start) {
    start = opts.balance.now;
    fromBalance = true;
  } else {
    const spent = opts.spends.filter((s) => s.spent_on >= iso(cur.start) && s.spent_on <= t).reduce((a, s) => a + Number(s.amount), 0);
    const paidBills = cur.bills.filter((b) => iso(b.due) < t || b.paid).reduce((a, b) => a + Number(b.bill.amount), 0);
    // Extra money only counts once it's landed.
    const extraIn = cur.paychecks.filter((p) => p.name.startsWith("➕")).reduce((a, p) => a + p.amount, 0);
    const extraLanded = opts.oneoffs.filter((o) => o.kind === "in" && o.on_date >= iso(cur.start) && o.on_date <= t).reduce((a, o) => a + Number(o.amount), 0);
    start = cur.income - extraIn + extraLanded - spent - paidBills - cur.savings;
  }

  // Everything that moves money from today on, in date order.
  type Ev = { on: string; amount: number; label: string; payday?: boolean };
  const evs: Ev[] = [];
  for (const [n, p] of plan.periods.entries()) {
    const pay = iso(p.start);
    if (n > 0) {
      for (const pc of p.paychecks) if (!pc.name.startsWith("➕")) evs.push({ on: pay, amount: pc.amount, label: pc.name, payday: true });
      evs.push({ on: pay, amount: -p.savings, label: "savings" });
      if (p.budgets) evs.push({ on: pay, amount: -p.budgets, label: "category budgets" });
    }
    for (const b of p.bills) {
      if (b.paid) continue;
      const on = iso(b.due) < t ? t : iso(b.due);
      if (n === 0 && !fromBalance && iso(b.due) < t) continue; // already counted as paid above
      evs.push({ on, amount: -Number(b.bill.amount), label: b.bill.name });
    }
  }
  for (const o of opts.oneoffs) {
    if (o.kind === "in" && o.on_date > t) evs.push({ on: o.on_date, amount: Number(o.amount), label: o.name, payday: true });
  }
  // What's left of this month's category budgets is spoken for too.
  const monthStart = iso(startOfMonth(today));
  const catLeft = opts.categories.reduce((a, c) => {
    if (c.ceiling == null) return a;
    const used = opts.spends.filter((s) => s.category_id === c.id && s.spent_on >= monthStart).reduce((x, s) => x + Number(s.amount), 0);
    return a + Math.max(0, Number(c.ceiling) - used);
  }, 0);
  if (catLeft) evs.push({ on: t, amount: -catLeft, label: "category budgets" });
  // Same day: money in lands before money goes out.
  evs.sort((a, b) => a.on.localeCompare(b.on) || b.amount - a.amount);

  // Running balance after each event; the fun money for a paycheck is the
  // lowest point from its payday on, minus the floor, minus earlier fun money.
  const points: { on: string; bal: number; after: string }[] = [{ on: t, bal: start, after: "today" }];
  let bal = start;
  for (const e of evs) {
    bal += e.amount;
    points.push({ on: e.on, bal, after: e.label });
  }
  const paydays = [t, ...plan.periods.slice(1).map((p) => iso(p.start))];
  const minFrom = (pd: string) => {
    const ahead = points.filter((p) => p.on >= pd);
    return ahead.length ? ahead.reduce((m, p) => (p.bal < m.bal ? p : m)) : null;
  };
  // Even it out: each paycheck gets the most it can while leaving every later
  // paycheck the same share before each tight spot (a rent week doesn't get 0
  // just because the weeks before spent it all). Unspent money rolls forward.
  const funByPeriod = new Map<string, number>();
  let taken = 0;
  let low: FloorPlan["low"] = null;
  const mins = paydays.map((pd) => minFrom(pd));
  paydays.forEach((pd, k) => {
    const here = mins[k];
    if (!here) return;
    let fun = Infinity;
    let binding = here;
    for (let j = k; j < paydays.length; j++) {
      const m = mins[j];
      if (!m) continue;
      const share = Math.max(0, m.bal - taken - floor) / (j - k + 1);
      if (share < fun) {
        fun = share;
        binding = m;
      }
    }
    fun = Math.floor(Number.isFinite(fun) ? fun : 0);
    // The tight spot that decided today's number, for the "why".
    if (k === 0) low = { at: parseISO(binding.on), amount: binding.bal, after: binding.after };
    funByPeriod.set(k === 0 ? iso(cur.start) : pd, fun);
    taken += fun;
  });
  const left = funByPeriod.get(iso(cur.start)) ?? 0;
  const daysLeft = Math.max(1, differenceInCalendarDays(cur.end, today));

  // What comes in this calendar month (landed or not), paychecks vs extra.
  const mEnd = iso(endOfMonth(today));
  const mStart = iso(startOfMonth(today));
  const items: FloorPlan["comingThisMonth"]["items"] = [];
  for (const i of opts.incomes)
    for (const d of payDates(i, startOfMonth(today), parseISO(mEnd))) {
      const actual = opts.paychecks.find((p) => p.income_id === i.id && p.paid_on === iso(d));
      items.push({ name: i.name, amount: actual ? Number(actual.amount) : Number(i.amount), on: d, extra: false });
    }
  for (const o of opts.oneoffs) if (o.kind === "in" && o.on_date >= mStart && o.on_date <= mEnd) items.push({ name: o.name, amount: Number(o.amount), on: parseISO(o.on_date), extra: true });
  items.sort((a, b) => a.on.getTime() - b.on.getTime());
  const comingThisMonth = { paychecks: items.filter((x) => !x.extra).reduce((a, x) => a + x.amount, 0), extra: items.filter((x) => x.extra).reduce((a, x) => a + x.amount, 0), items };

  return { start, fromBalance, left, perDay: left / daysLeft, daysLeft, nextPay: cur.end, low, funByPeriod, comingThisMonth };
}
