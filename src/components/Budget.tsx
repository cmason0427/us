"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import {
  DEFAULT_SETTINGS,
  buildPlan,
  categoryStatus,
  iso,
  money,
  money2,
  monthlyBills,
  monthlyIncome,
  safeToSpend,
  spendingDays,
  type Bill,
  type BillFreq,
  type Category,
  type Income,
  type IncomeFreq,
  type Paycheck,
  type Period,
  type Settings,
  type Spend,
} from "@/lib/budget";
import { useNow } from "@/lib/dates";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

/* ─── data ──────────────────────────────────────────────────────────────── */

// Every budget table is owner-only in the database, so these only ever return your own rows.
function useRows<T>(table: string, order = "created_at") {
  const { data = [] } = useLive<T[]>(
    `budget:${table}`,
    async () => {
      const { data, error } = await supabaseBrowser().from(table).select("*").order(order);
      if (error) throw error;
      return data as T[];
    },
    [table],
  );
  return data;
}

export function useBudget() {
  const incomes = useRows<Income>("budget_income");
  const paychecks = useRows<Paycheck>("budget_paychecks");
  const bills = useRows<Bill>("budget_bills");
  const paidRows = useRows<{ bill_id: string; due_on: string }>("budget_bill_paid", "paid_at");
  const categories = useRows<Category>("budget_categories", "position");
  const spends = useRows<Spend>("budget_spend", "spent_on");
  const settingsRows = useRows<Settings & { owner: string }>("budget_settings", "updated_at");
  const settings = settingsRows[0] ?? DEFAULT_SETTINGS;
  const paid = new Set(paidRows.map((p) => `${p.bill_id}:${p.due_on}`));
  const plan = buildPlan({ incomes, paychecks, bills, paid, categories, settings });
  const safe = safeToSpend(plan.current, spends, Number(settings.cushion));
  const cats = categoryStatus(categories, spends);
  return { incomes, paychecks, bills, paid, categories, spends, settings, plan, safe, cats };
}

const db = () => supabaseBrowser();
async function run(p: PromiseLike<{ error: { message: string } | null }>, toast: (m: string) => void) {
  const { error } = await p;
  if (error) toast(error.message);
  refreshAll();
  return !error;
}

/* ─── log a purchase (also in the + menu) ───────────────────────────────── */

/** "I spent $12": amount first, category optional. Warns when a ceiling is close or hit. */
export function SpendForm({ onDone }: { onDone: () => void }) {
  const { meId, toast } = useApp();
  const { categories, spends } = useBudget();
  const [amount, setAmount] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [day, setDay] = useState(iso(new Date()));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!(n > 0)) return;
    const ok = await run(db().from("budget_spend").insert({ owner: meId, amount: n, category_id: cat, note: note.trim() || null, spent_on: day }), toast);
    if (!ok) return;
    // Heads-up right when it happens (this month, including what you just logged).
    const c = categories.find((x) => x.id === cat);
    if (c?.ceiling) {
      const st = categoryStatus([c], [...spends, { id: "new", category_id: c.id, amount: n, note: null, spent_on: day }])[0];
      if (st.state === "over") toast(`${c.emoji ?? ""} ${c.name}: that's ${money(st.spent)} of ${money(st.ceiling!)} this month. Over the ceiling.`);
      else if (st.state === "close") toast(`${c.emoji ?? ""} ${c.name}: ${Math.round(st.pct)}% of this month's ${money(st.ceiling!)}. Getting close.`);
      else toast("Logged 💸");
    } else toast("Logged 💸");
    onDone();
  }
  return (
    <form className="stack" onSubmit={save}>
      <div className="money-input">
        <span>$</span>
        <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" autoFocus aria-label="Amount" />
      </div>
      <div className="chips">
        <button type="button" className="chip chip-sm" aria-pressed={cat === null} onClick={() => setCat(null)}>
          🎈 fun money
        </button>
        {categories.map((c) => (
          <button key={c.id} type="button" className="chip chip-sm" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
            {c.emoji} {c.name}
          </button>
        ))}
      </div>
      <div className="grid-2">
        <input className="input input-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="what (optional)" aria-label="What" />
        <input className="input input-sm" type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day" />
      </div>
      <p className="small faint">Only you ever see this.</p>
      <button className="btn btn-primary btn-block" disabled={!(Number(amount) > 0)}>
        Log it
      </button>
    </form>
  );
}

/* ─── the page ──────────────────────────────────────────────────────────── */

const FREQ_LABEL: Record<IncomeFreq, string> = { weekly: "Every week", biweekly: "Every 2 weeks", semimonthly: "Twice a month", monthly: "Monthly" };
const BILL_FREQ: Record<BillFreq, string> = { monthly: "Monthly", weekly: "Weekly", biweekly: "Every 2 weeks", quarterly: "Every 3 months", yearly: "Yearly" };
const d = (x: Date | string) => format(typeof x === "string" ? parseISO(x) : x, "EEE M/d");

export function MoneyView() {
  const b = useBudget();
  const [sheet, setSheet] = useState<null | "spend" | "income" | "bill" | "cat" | "settings" | "period" | "history">(null);
  const [editIncome, setEditIncome] = useState<Income | undefined>();
  const [editBill, setEditBill] = useState<Bill | undefined>();
  const [editCat, setEditCat] = useState<Category | undefined>();
  const [period, setPeriod] = useState<Period | null>(null);
  const [setup, setSetup] = useState(false);
  const { meId, toast } = useApp();
  const nowMs = useNow()?.getTime() ?? 0;
  const cur = b.plan.current;

  if (!b.incomes.length)
    return (
      <div className="stack">
        <div className="card stack-sm">
          <strong>Start with your paycheck</strong>
          <p className="small muted">Just how much and how often. Then add bills. The app works out what to set aside from each paycheck and what&apos;s safe to spend, so you don&apos;t have to.</p>
          <IncomeForm onDone={() => {}} />
        </div>
      </div>
    );

  const upcoming = b.plan.periods.flatMap((p) => p.bills).filter((x) => x.due.getTime() - nowMs < 31 * 864e5 && x.due.getTime() > nowMs - 7 * 864e5);
  const pattern = spendingDays(b.spends);
  const alerts = b.cats.filter((c) => c.state === "over" || c.state === "close");
  const perMonth = monthlyIncome(b.incomes);
  const billsMonth = monthlyBills(b.bills);

  async function togglePaid(bill: Bill, due: Date, isPaid: boolean) {
    const key = { bill_id: bill.id, due_on: iso(due) };
    await run(isPaid ? db().from("budget_bill_paid").delete().match(key) : db().from("budget_bill_paid").insert({ ...key, owner: meId }), toast);
  }

  return (
    <div className="stack">
      {cur && b.safe && (
        <section className="money-hero">
          <span className="small">safe to spend</span>
          <strong className="money-big">{money(b.safe.left)}</strong>
          <span className="small">
            until payday {d(cur.end)} · about {money(b.safe.perDay)}/day for {b.safe.daysLeft} day{b.safe.daysLeft === 1 ? "" : "s"}
          </span>
          <button className="btn btn-sm money-spend" onClick={() => setSheet("spend")}>
            💸 I spent
          </button>
        </section>
      )}

      {b.plan.shortfall > 0 && (
        <p className="money-alert">
          This paycheck is {money(b.plan.shortfall)} short of what&apos;s due before the next one. Skip fun money this round, or move a bill if you can.
        </p>
      )}
      {alerts.map((a) => (
        <p key={a.c.id} className={`money-alert${a.state === "over" ? " over" : ""}`}>
          {a.c.emoji} {a.c.name}: {money(a.spent)} of {money(a.ceiling!)} this month{a.state === "over" ? ". Over." : ". Getting close."}
        </p>
      ))}

      {cur && (
        <section className="card stack-sm">
          <div className="row-between">
            <strong>This paycheck</strong>
            <span className="small muted">
              {d(cur.start)} · {money(cur.income)}
            </span>
          </div>
          <SplitBar p={cur} />
          <ul className="money-lines">
            <li>
              <span>🧾 Bills before {d(cur.end)}</span>
              <span>{money(cur.billTotal)}</span>
            </li>
            <li>
              <span>🐷 To savings</span>
              <span>{money(cur.savings)}</span>
            </li>
            {cur.budgets > 0 && (
              <li>
                <span>🗂️ Category budgets</span>
                <span>{money(cur.budgets)}</span>
              </li>
            )}
            {cur.setAside > 0 && (
              <li className="strong">
                <span>📦 Put aside for later bills</span>
                <span>{money(cur.setAside)}</span>
              </li>
            )}
            {cur.fromEarlier > 0 && (
              <li>
                <span>📦 Use from what you set aside</span>
                <span>{money(cur.fromEarlier)}</span>
              </li>
            )}
            <li className="strong">
              <span>🎈 Fun money</span>
              <span>{money(cur.free)}</span>
            </li>
          </ul>
          {!cur.paychecks.some((p) => p.actual) && <PaycheckActual period={cur} incomes={b.incomes} />}
        </section>
      )}

      <section className="stack-sm">
        <h3 className="pantry-h">Coming up</h3>
        {upcoming.length === 0 ? (
          <p className="small muted">No bills in the next month. Add them under Set up.</p>
        ) : (
          <ul className="pantry-list">
            {upcoming.map(({ bill, due, paid }) => (
              <li key={bill.id + iso(due)} className="pantry-row">
                <input type="checkbox" className="check check-sm" checked={paid} onChange={() => togglePaid(bill, due, paid)} aria-label={`Paid ${bill.name}`} />
                <span className={`pantry-name${paid ? " faint" : ""}`}>
                  {bill.emoji} {bill.name}
                  <span className="pantry-meta"> {d(due)}{bill.autopay ? " · autopay" : ""}</span>
                </span>
                <span className="small">{money2(Number(bill.amount))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {b.categories.length > 0 && (
        <section className="stack-sm">
          <div className="row-between">
            <h3 className="pantry-h">This month</h3>
            <button className="btn-link small" onClick={() => setSheet("history")}>
              history
            </button>
          </div>
          {b.cats.map(({ c, spent, ceiling, pct, state }) => (
            <button key={c.id} className="money-cat" onClick={() => (setEditCat(c), setSheet("cat"))}>
              <span className="row-between">
                <span>
                  {c.emoji} {c.name}
                </span>
                <span className="small">
                  {money(spent)}
                  {ceiling != null ? ` / ${money(ceiling)}` : ""}
                </span>
              </span>
              {ceiling != null && (
                <span className={`money-meter ${state}`}>
                  <i style={{ width: `${Math.min(100, pct)}%` }} />
                </span>
              )}
            </button>
          ))}
        </section>
      )}

      <section className="stack-sm">
        <h3 className="pantry-h">Paychecks ahead</h3>
        <ul className="pantry-list">
          {b.plan.periods.slice(1, 7).map((p) => (
            <li key={iso(p.start)} className="pantry-row">
              <button className="pantry-name" onClick={() => (setPeriod(p), setSheet("period"))}>
                {d(p.start)} · {money(p.income)}
                <span className="pantry-meta">
                  {" "}
                  bills {money(p.billTotal)}
                  {p.setAside ? ` · put aside ${money(p.setAside)}` : ""}
                  {p.fromEarlier ? ` · use ${money(p.fromEarlier)} set aside` : ""}
                </span>
              </button>
              <span className="small">🎈 {money(p.free)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card small stack-sm money-facts">
        <span>
          About {money(perMonth)}/mo in, {money(billsMonth)}/mo in bills ({perMonth ? Math.round((billsMonth / perMonth) * 100) : 0}%).
        </span>
        {pattern && (
          <span>
            You tend to spend on {pattern.days.join(" and ")} ({pattern.share}% of spending). Fun money stretches further if those days get a little extra.
          </span>
        )}
        {cur && cur.held > 0 && <span>After this paycheck you&apos;ll have {money(cur.held)} set aside for upcoming bills. Leave it be.</span>}
      </section>

      <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setSetup((s) => !s)}>
        {setup ? "▾" : "▸"} Set up: pay, bills, savings, categories
      </button>
      {setup && (
        <div className="stack">
          <SetupList
            title="Pay"
            rows={b.incomes.map((i) => ({ id: i.id, label: `${i.name} · ${money2(Number(i.amount))}`, sub: `${FREQ_LABEL[i.freq]} · next from ${d(i.anchor)}`, onClick: () => (setEditIncome(i), setSheet("income")) }))}
            onAdd={() => (setEditIncome(undefined), setSheet("income"))}
          />
          <SetupList
            title="Bills"
            rows={b.bills.map((x) => ({ id: x.id, label: `${x.emoji ?? "🧾"} ${x.name} · ${money2(Number(x.amount))}`, sub: `${BILL_FREQ[x.freq]}${x.autopay ? " · autopay" : ""}`, onClick: () => (setEditBill(x), setSheet("bill")) }))}
            onAdd={() => (setEditBill(undefined), setSheet("bill"))}
          />
          <SetupList
            title="Categories"
            rows={b.categories.map((c) => ({ id: c.id, label: `${c.emoji ?? "🗂️"} ${c.name}`, sub: c.ceiling != null ? `ceiling ${money(Number(c.ceiling))}/mo · warn at ${c.warn_pct}%` : "just tracking", onClick: () => (setEditCat(c), setSheet("cat")) }))}
            onAdd={() => (setEditCat(undefined), setSheet("cat"))}
          />
          <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setSheet("settings")}>
            🐷 Savings: {b.settings.save_pct}%{Number(b.settings.save_fixed) ? ` + ${money(Number(b.settings.save_fixed))}` : ""} of each paycheck
            {Number(b.settings.cushion) ? ` · keep ${money(Number(b.settings.cushion))} cushion` : ""}
          </button>
        </div>
      )}

      {sheet === "spend" && (
        <Sheet title="💸 I spent" onClose={() => setSheet(null)}>
          <SpendForm onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet === "income" && (
        <Sheet title={editIncome ? "Edit pay" : "Add pay"} onClose={() => setSheet(null)}>
          <IncomeForm initial={editIncome} onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet === "bill" && (
        <Sheet title={editBill ? `Edit ${editBill.name}` : "Add a bill"} onClose={() => setSheet(null)}>
          <BillForm initial={editBill} onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet === "cat" && (
        <Sheet title={editCat ? `${editCat.emoji ?? ""} ${editCat.name}` : "New category"} onClose={() => setSheet(null)}>
          <CategoryForm initial={editCat} spends={b.spends} onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet === "settings" && (
        <Sheet title="🐷 Savings & cushion" onClose={() => setSheet(null)}>
          <SettingsForm initial={b.settings} onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet === "period" && period && (
        <Sheet title={`Paycheck ${d(period.start)}`} onClose={() => setSheet(null)}>
          <div className="stack-sm">
            <SplitBar p={period} />
            <ul className="money-lines">
              {period.paychecks.map((pc, i) => (
                <li key={i}>
                  <span>💵 {pc.name}</span>
                  <span>{money2(pc.amount)}</span>
                </li>
              ))}
              {period.bills.map((x) => (
                <li key={x.bill.id + iso(x.due)}>
                  <span>
                    {x.bill.emoji ?? "🧾"} {x.bill.name} · {d(x.due)}
                  </span>
                  <span>{money2(Number(x.bill.amount))}</span>
                </li>
              ))}
              <li>
                <span>🐷 Savings</span>
                <span>{money(period.savings)}</span>
              </li>
              {period.setAside > 0 && (
                <li>
                  <span>📦 Put aside</span>
                  <span>{money(period.setAside)}</span>
                </li>
              )}
              {period.fromEarlier > 0 && (
                <li>
                  <span>📦 Use set-aside</span>
                  <span>{money(period.fromEarlier)}</span>
                </li>
              )}
              <li className="strong">
                <span>🎈 Fun money</span>
                <span>{money(period.free)}</span>
              </li>
            </ul>
          </div>
        </Sheet>
      )}
      {sheet === "history" && (
        <Sheet title="Spending" onClose={() => setSheet(null)}>
          <SpendHistory spends={b.spends} categories={b.categories} />
        </Sheet>
      )}
    </div>
  );
}

/** Where this paycheck goes, as one bar. */
function SplitBar({ p }: { p: Period }) {
  const total = Math.max(1, p.income);
  const parts = [
    { k: "bills", v: p.billTotal },
    { k: "save", v: p.savings },
    { k: "budgets", v: p.budgets },
    { k: "aside", v: p.setAside },
    { k: "fun", v: p.free },
  ].filter((x) => x.v > 0);
  return (
    <span className="split-bar" aria-hidden>
      {parts.map((x) => (
        <i key={x.k} className={x.k} style={{ width: `${(x.v / total) * 100}%` }} />
      ))}
    </span>
  );
}

/** "Got a different amount?" for paychecks that vary (overtime, fewer hours). */
function PaycheckActual({ period, incomes }: { period: Period; incomes: Income[] }) {
  const { meId, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState("");
  const inc = incomes.find((i) => period.paychecks.some((p) => p.name === i.name));
  if (!inc) return null;
  if (!open)
    return (
      <button className="btn-link small" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(true)}>
        This check was a different amount?
      </button>
    );
  return (
    <form
      className="quick-add"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!(Number(amt) > 0)) return;
        await run(db().from("budget_paychecks").insert({ owner: meId, income_id: inc.id, paid_on: iso(period.start), amount: Number(amt) }), toast);
        setOpen(false);
      }}
    >
      <input className="input input-sm grow" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ""))} placeholder={`what landed (expected ${money2(Number(inc.amount))})`} autoFocus />
      <button className="btn btn-sm btn-primary">Save</button>
    </form>
  );
}

function SetupList({ title, rows, onAdd }: { title: string; rows: { id: string; label: string; sub: string; onClick: () => void }[]; onAdd: () => void }) {
  return (
    <div className="stack-sm">
      <div className="row-between">
        <h3 className="pantry-h">{title}</h3>
        <button className="btn-link small" onClick={onAdd}>
          ＋ add
        </button>
      </div>
      {rows.length > 0 && (
        <ul className="pantry-list">
          {rows.map((r) => (
            <li key={r.id} className="pantry-row">
              <button className="pantry-name" onClick={r.onClick}>
                {r.label}
                <span className="pantry-meta"> {r.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeleteBtn({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => confirm(`Delete ${label}?`) && onDelete()}>
      Delete
    </button>
  );
}

function IncomeForm({ initial, onDone }: { initial?: Income; onDone: () => void }) {
  const { meId, toast } = useApp();
  const [f, setF] = useState({ name: initial?.name ?? "Paycheck", amount: initial ? String(initial.amount) : "", freq: initial?.freq ?? ("biweekly" as IncomeFreq), anchor: initial?.anchor ?? iso(new Date()), day2: initial?.day2 ? String(initial.day2) : "15" });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!(Number(f.amount) > 0)) return;
    const row = { name: f.name.trim() || "Paycheck", amount: Number(f.amount), freq: f.freq, anchor: f.anchor, day2: f.freq === "semimonthly" ? Number(f.day2) || 15 : null };
    if (await run(initial ? db().from("budget_income").update(row).eq("id", initial.id) : db().from("budget_income").insert({ ...row, owner: meId }), toast)) onDone();
  }
  return (
    <form className="stack-sm" onSubmit={save}>
      <div className="grid-2">
        <input className="input input-sm" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Job name" aria-label="Name" />
        <div className="money-input">
          <span>$</span>
          <input className="input input-sm" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, "") })} placeholder="take-home" aria-label="Take-home amount" />
        </div>
      </div>
      <div className="chips">
        {(Object.keys(FREQ_LABEL) as IncomeFreq[]).map((k) => (
          <button key={k} type="button" className="chip chip-sm" aria-pressed={f.freq === k} onClick={() => setF({ ...f, freq: k })}>
            {FREQ_LABEL[k]}
          </button>
        ))}
      </div>
      <label className="field">
        <span>{f.freq === "semimonthly" ? "One payday (e.g. the 1st)" : "A recent or upcoming payday"}</span>
        <input className="input input-sm" type="date" value={f.anchor} onChange={(e) => setF({ ...f, anchor: e.target.value })} />
      </label>
      {f.freq === "semimonthly" && (
        <label className="field">
          <span>The other payday (day of the month)</span>
          <input className="input input-sm" inputMode="numeric" value={f.day2} onChange={(e) => setF({ ...f, day2: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
        </label>
      )}
      <p className="small faint">Use what actually lands in your account. If a check comes in different, you can fix just that one later.</p>
      <div className="row-between">
        {initial ? <DeleteBtn label={initial.name} onDelete={() => run(db().from("budget_income").delete().eq("id", initial.id), toast).then(onDone)} /> : <span />}
        <button className="btn btn-primary btn-sm" disabled={!(Number(f.amount) > 0)}>
          Save
        </button>
      </div>
    </form>
  );
}

const BILL_EMOJI = ["🏠", "💡", "📱", "🚗", "🛡️", "💳", "📺", "🎵", "🐶", "💊", "🎓", "🧾"];
function BillForm({ initial, onDone }: { initial?: Bill; onDone: () => void }) {
  const { meId, toast } = useApp();
  const [f, setF] = useState({ name: initial?.name ?? "", emoji: initial?.emoji ?? "🧾", amount: initial ? String(initial.amount) : "", freq: initial?.freq ?? ("monthly" as BillFreq), anchor: initial?.anchor ?? iso(new Date()), autopay: initial?.autopay ?? false });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || !(Number(f.amount) >= 0) || !f.amount) return;
    const row = { name: f.name.trim(), emoji: f.emoji, amount: Number(f.amount), freq: f.freq, anchor: f.anchor, autopay: f.autopay };
    if (await run(initial ? db().from("budget_bills").update(row).eq("id", initial.id) : db().from("budget_bills").insert({ ...row, owner: meId }), toast)) onDone();
  }
  return (
    <form className="stack-sm" onSubmit={save}>
      <div className="chips">
        {BILL_EMOJI.map((e) => (
          <button key={e} type="button" className="chip chip-sm" aria-pressed={f.emoji === e} onClick={() => setF({ ...f, emoji: e })}>
            {e}
          </button>
        ))}
      </div>
      <div className="grid-2">
        <input className="input input-sm" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Rent, phone…" autoFocus={!initial} aria-label="Name" />
        <div className="money-input">
          <span>$</span>
          <input className="input input-sm" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, "") })} placeholder="amount" aria-label="Amount" />
        </div>
      </div>
      <div className="chips">
        {(Object.keys(BILL_FREQ) as BillFreq[]).map((k) => (
          <button key={k} type="button" className="chip chip-sm" aria-pressed={f.freq === k} onClick={() => setF({ ...f, freq: k })}>
            {BILL_FREQ[k]}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Next due date</span>
        <input className="input input-sm" type="date" value={f.anchor} onChange={(e) => setF({ ...f, anchor: e.target.value })} />
      </label>
      <label className="toggle-row small">
        <span>Autopay</span>
        <input type="checkbox" checked={f.autopay} onChange={(e) => setF({ ...f, autopay: e.target.checked })} />
      </label>
      <div className="row-between">
        {initial ? <DeleteBtn label={initial.name} onDelete={() => run(db().from("budget_bills").delete().eq("id", initial.id), toast).then(onDone)} /> : <span />}
        <button className="btn btn-primary btn-sm" disabled={!f.name.trim() || !f.amount}>
          Save
        </button>
      </div>
    </form>
  );
}

const CAT_EMOJI = ["🍔", "🛒", "🃏", "📦", "⛽", "🎮", "👕", "🐶", "💄", "🍺", "🎁", "✨"];
function CategoryForm({ initial, spends, onDone }: { initial?: Category; spends: Spend[]; onDone: () => void }) {
  const { meId, toast } = useApp();
  const [f, setF] = useState({ name: initial?.name ?? "", emoji: initial?.emoji ?? "🍔", ceiling: initial?.ceiling != null ? String(initial.ceiling) : "", warn: initial?.warn_pct ?? 80 });
  const recent = initial ? spends.filter((s) => s.category_id === initial.id).slice(-12).reverse() : [];
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return;
    const row = { name: f.name.trim(), emoji: f.emoji, ceiling: f.ceiling ? Number(f.ceiling) : null, warn_pct: f.warn };
    if (await run(initial ? db().from("budget_categories").update(row).eq("id", initial.id) : db().from("budget_categories").insert({ ...row, owner: meId, position: 99 }), toast)) onDone();
  }
  return (
    <form className="stack-sm" onSubmit={save}>
      <div className="chips">
        {CAT_EMOJI.map((e) => (
          <button key={e} type="button" className="chip chip-sm" aria-pressed={f.emoji === e} onClick={() => setF({ ...f, emoji: e })}>
            {e}
          </button>
        ))}
      </div>
      <div className="grid-2">
        <input className="input input-sm" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Food, MTG, online shopping…" autoFocus={!initial} aria-label="Name" />
        <div className="money-input">
          <span>$</span>
          <input className="input input-sm" inputMode="decimal" value={f.ceiling} onChange={(e) => setF({ ...f, ceiling: e.target.value.replace(/[^\d.]/g, "") })} placeholder="ceiling / mo" aria-label="Monthly ceiling" />
        </div>
      </div>
      {f.ceiling && (
        <label className="feel-row">
          <span className="feel-name">Warn at</span>
          <input type="range" min={50} max={100} step={5} value={f.warn} onChange={(e) => setF({ ...f, warn: Number(e.target.value) })} />
          <span className="small muted">{f.warn}%</span>
        </label>
      )}
      <p className="small faint">No ceiling = just track it. With one, it&apos;s set aside from each paycheck and you get a heads-up near it.</p>
      {recent.length > 0 && (
        <ul className="pantry-list">
          {recent.map((s) => (
            <li key={s.id} className="pantry-row">
              <span className="pantry-name">
                {s.note ?? "—"}
                <span className="pantry-meta"> {d(s.spent_on)}</span>
              </span>
              <span className="small">{money2(Number(s.amount))}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="row-between">
        {initial ? <DeleteBtn label={initial.name} onDelete={() => run(db().from("budget_categories").delete().eq("id", initial.id), toast).then(onDone)} /> : <span />}
        <button className="btn btn-primary btn-sm" disabled={!f.name.trim()}>
          Save
        </button>
      </div>
    </form>
  );
}

function SettingsForm({ initial, onDone }: { initial: Settings; onDone: () => void }) {
  const { meId, toast } = useApp();
  const [f, setF] = useState({ pct: Number(initial.save_pct), fixed: String(Number(initial.save_fixed) || ""), cushion: String(Number(initial.cushion) || "") });
  return (
    <form
      className="stack-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(db().from("budget_settings").upsert({ owner: meId, save_pct: f.pct, save_fixed: Number(f.fixed) || 0, cushion: Number(f.cushion) || 0, updated_at: new Date().toISOString() }), toast);
        if (ok) onDone();
      }}
    >
      <label className="feel-row">
        <span className="feel-name">Save</span>
        <input type="range" min={0} max={40} value={f.pct} onChange={(e) => setF({ ...f, pct: Number(e.target.value) })} />
        <span className="small muted">{f.pct}% / check</span>
      </label>
      <div className="grid-2">
        <div className="money-input">
          <span>+$</span>
          <input className="input input-sm" inputMode="decimal" value={f.fixed} onChange={(e) => setF({ ...f, fixed: e.target.value.replace(/[^\d.]/g, "") })} placeholder="extra per check" />
        </div>
        <div className="money-input">
          <span>$</span>
          <input className="input input-sm" inputMode="decimal" value={f.cushion} onChange={(e) => setF({ ...f, cushion: e.target.value.replace(/[^\d.]/g, "") })} placeholder="cushion" />
        </div>
      </div>
      <p className="small faint">The cushion is a little buffer that never counts as spendable. 10% savings is a good default; lower it on tight months, no guilt.</p>
      <button className="btn btn-primary btn-sm">Save</button>
    </form>
  );
}

function SpendHistory({ spends, categories }: { spends: Spend[]; categories: Category[] }) {
  const { toast } = useApp();
  const list = [...spends].reverse().slice(0, 80);
  const cat = (id: string | null) => categories.find((c) => c.id === id);
  if (!list.length) return <p className="small muted">Nothing logged yet.</p>;
  return (
    <ul className="pantry-list">
      {list.map((s) => (
        <li key={s.id} className="pantry-row">
          <span className="pantry-name">
            {cat(s.category_id)?.emoji ?? "🎈"} {s.note ?? cat(s.category_id)?.name ?? "fun money"}
            <span className="pantry-meta"> {d(s.spent_on)}</span>
          </span>
          <span className="small">{money2(Number(s.amount))}</span>
          <button className="lt-x" aria-label="Delete" onClick={() => run(db().from("budget_spend").delete().eq("id", s.id), toast)}>
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
