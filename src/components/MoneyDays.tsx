"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { iso, money, type DayAllowance, type FloorPlan, type Ledger, type Move, type Rate, type Spend } from "@/lib/budget";
import { useNow } from "@/lib/dates";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

// The in-progress drag (one finger at a time); never rendered from.
type Gesture = { hold: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null; lifted: boolean; justDragged: boolean };
const gesture: Gesture = { hold: null, lifted: false, justDragged: false };
const setGesture = (p: Partial<Gesture>) => Object.assign(gesture, p);

const dayName = (day: string, today: string) => (day === today ? "today" : day === iso(addDays(parseISO(today), 1)) ? "tomorrow" : format(parseISO(day), "EEE M/d"));

/**
 * Fun money one day at a time. What you don't spend lands on the next day by
 * itself. Hold a day and drag it onto another to move money there, or tap a
 * day to log what you spent, mark it a no-spend day, or move some.
 */
export function DayByDay({ fp, ledger, rates, moves, spends }: { fp: FloorPlan; ledger: Ledger; rates: Rate[]; moves: Move[]; spends: Spend[] }) {
  const { meId, toast } = useApp();
  const now = useNow();
  const { data: marks = [] } = useLive<{ day: string }[]>(
    "budget:budget_day_marks",
    async () => {
      const { data, error } = await supabaseBrowser().from("budget_day_marks").select("day").order("day");
      if (error) throw error;
      return data;
    },
    ["budget_day_marks"],
  );
  const [open, setOpen] = useState<string | null>(null);
  const [moveDraft, setMoveDraft] = useState<{ from: string; to: string } | null>(null);
  const [drag, setDrag] = useState<{ day: string; x: number; y: number } | null>(null);
  const ghost = useRef<HTMLDivElement>(null);

  // Lock in each paycheck's normal daily amount: the next one keeps
  // updating until it lands, then it stays put, so leftovers pile onto the
  // next day instead of being spread thin again.
  const lockCur = ledger.lock.cur ? `${ledger.lock.cur.period_start}|${ledger.lock.cur.rate}|${ledger.lock.cur.ledger_from}` : "";
  const nx = ledger.lock.next;
  const storedNext = nx ? rates.find((r) => r.period_start === nx.period_start) : undefined;
  const lockNext = nx && (!storedNext || Math.abs(Number(storedNext.rate) - nx.rate) > 0.5 || storedNext.ledger_from !== nx.ledger_from) ? `${nx.period_start}|${nx.rate}|${nx.ledger_from}` : "";
  useEffect(() => {
    const rows = [lockCur, lockNext].filter(Boolean).map((k) => {
      const [period_start, rate, ledger_from] = k.split("|");
      return { owner: meId, period_start, rate: Number(rate), ledger_from, locked_at: new Date().toISOString() };
    });
    if (rows.length) supabaseBrowser().from("budget_rates").upsert(rows).then(() => refreshAll());
  }, [lockCur, lockNext, meId]);

  useEffect(() => {
    const stop = (e: TouchEvent) => gesture.lifted && e.preventDefault();
    document.addEventListener("touchmove", stop, { passive: false });
    return () => document.removeEventListener("touchmove", stop);
  }, []);

  if (!now) return null;
  const today = iso(now);
  const days = ledger.days;
  const yesterday = iso(addDays(now, -1));
  const ySpent = spends.filter((s) => !s.category_id && s.spent_on === yesterday).reduce((a, s) => a + Number(s.amount), 0);

  function lift(el: HTMLElement, pointerId: number, day: string, x: number, y: number) {
    try {
      el.setPointerCapture(pointerId);
    } catch {}
    setGesture({ lifted: true });
    setDrag({ day, x, y });
    navigator.vibrate?.(15);
  }
  function cancelHold() {
    if (gesture.hold) clearTimeout(gesture.hold.timer);
    setGesture({ hold: null });
  }
  function onDown(e: React.PointerEvent, day: string) {
    const el = e.currentTarget as HTMLElement;
    const { clientX: x, clientY: y, pointerId } = e;
    setGesture({ hold: { timer: setTimeout(() => lift(el, pointerId, day, x, y), 350), x, y } });
  }
  function onMove(e: React.PointerEvent) {
    if (gesture.hold && !drag && Math.hypot(e.clientX - gesture.hold.x, e.clientY - gesture.hold.y) > 8) cancelHold();
    if (drag && ghost.current) ghost.current.style.transform = `translate(${e.clientX - drag.x}px, ${e.clientY - drag.y}px)`;
  }
  function onUp(e: React.PointerEvent) {
    cancelHold();
    setGesture({ lifted: false });
    if (!drag) return;
    setGesture({ justDragged: true });
    setTimeout(() => setGesture({ justDragged: false }), 50);
    const from = drag.day;
    setDrag(null);
    const hit = (document.elementsFromPoint(e.clientX, e.clientY) as HTMLElement[]).find((h) => h.dataset.day);
    const to = hit?.dataset.day;
    if (to && to !== from) setMoveDraft({ from, to });
  }
  function dropCancel() {
    cancelHold();
    setGesture({ lifted: false });
    setDrag(null);
  }

  const dragged = drag ? days.find((d) => d.day === drag.day) : null;
  const openDay = open === yesterday ? null : days.find((d) => d.day === open) ?? null;

  return (
    <section className="stack-sm">
      <div>
        <strong className="small">🎈 Day by day</strong>
        <span className="small faint"> · what you don&apos;t spend rolls to the next day. Hold a day and drag it onto another to move money.</span>
      </div>
      <div className="money-days">
        {days.map((d) => (
          <button
            key={d.day}
            data-day={d.day}
            className={`money-dayt${d.day === today ? " today" : ""}${drag?.day === d.day ? " lifting" : ""}${d.moved > 0 ? " got" : ""}`}
            onPointerDown={(e) => onDown(e, d.day)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={dropCancel}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => !gesture.justDragged && !drag && setOpen(d.day)}
          >
            <span className="money-dayt-w">{d.day === today ? "today" : format(parseISO(d.day), "EEE")}</span>
            <span className="money-dayt-n">{format(parseISO(d.day), "M/d")}</span>
            <span className="money-dayt-a">{money(d.amount)}</span>
            {d.day === today && d.carried > 0 && <span className="money-dayt-x">+{money(d.carried)} rolled</span>}
            {d.spent > 0 ? <span className="money-dayt-x">spent {money(d.spent)}</span> : marks.some((m) => m.day === d.day) ? <span className="money-dayt-x">✓ none</span> : null}
          </button>
        ))}
      </div>
      <button className="btn-link small" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(yesterday)}>
        Yesterday: {ySpent ? `spent ${money(ySpent)}` : marks.some((m) => m.day === yesterday) ? "✓ no spending" : "nothing logged"} · fix
      </button>
      {drag && dragged && (
        <div ref={ghost} className="money-dayt money-ghost" style={{ left: drag.x - 34, top: drag.y - 30 }}>
          <span className="money-dayt-a">{money(dragged.amount)}</span>
        </div>
      )}

      {open && (
        <Sheet title={open === today ? "Today" : format(parseISO(open), "EEEE M/d")} onClose={() => setOpen(null)}>
          <DaySheet day={open} a={openDay} today={today} days={days} held={open === today ? ledger.held : 0} marked={marks.some((m) => m.day === open)} moves={moves} spends={spends} onMove={(to) => setMoveDraft({ from: open, to })} />
        </Sheet>
      )}
      {moveDraft && (
        <Sheet title="Move money" onClose={() => setMoveDraft(null)}>
          <MoveForm draft={moveDraft} days={days} today={today} fp={fp} onDone={() => (setMoveDraft(null), setOpen(null))} toast={toast} />
        </Sheet>
      )}
    </section>
  );
}

function DaySheet({ day, a, today, days, held, marked, moves, spends, onMove }: { day: string; a: DayAllowance | null; today: string; days: DayAllowance[]; held: number; marked: boolean; moves: Move[]; spends: Spend[]; onMove: (to: string) => void }) {
  const { meId, toast } = useApp();
  const logged = spends.filter((s) => !s.category_id && s.spent_on === day).reduce((x, s) => x + Number(s.amount), 0);
  const [total, setTotal] = useState(logged ? String(logged) : "");
  const past = day <= today;
  const db = supabaseBrowser();
  const mine = moves.filter((m) => m.from_day === day || m.to_day === day);

  async function saveTotal() {
    const n = Number(total);
    if (!(n >= 0)) return;
    if (n < logged) return toast(`You've already logged ${money(logged)} that day. Change it in your spending log.`);
    if (n > logged) {
      const { error } = await db.from("budget_spend").insert({ owner: meId, amount: Math.round((n - logged) * 100) / 100, category_id: null, note: logged ? "rest of the day" : "that day", spent_on: day });
      if (error) return toast(error.message);
    }
    await db.from("budget_day_marks").delete().eq("owner", meId).eq("day", day);
    refreshAll();
    toast(n > logged ? "Logged 💸" : "Saved");
  }
  async function noSpend() {
    const { error } = await db.from("budget_day_marks").upsert({ owner: meId, day });
    if (error) return toast(error.message);
    refreshAll();
    toast("✓ It rolls onto the next day");
  }
  async function undoMove(m: Move) {
    await db.from("budget_moves").delete().eq("id", m.id);
    refreshAll();
  }

  return (
    <div className="stack">
      {a && (
        <ul className="money-lines small">
          <li>
            <span>Normal day</span>
            <span>{money(a.base)}</span>
          </li>
          {a.carried !== 0 && (
            <li>
              <span>{a.carried > 0 ? "Rolled over from earlier days" : day === today ? "Overspent earlier, comes out of today" : "Covering earlier overspending"}</span>
              <span>{a.carried > 0 ? "+" : "−"}{money(Math.abs(a.carried))}</span>
            </li>
          )}
          {a.moved !== 0 && (
            <li>
              <span>Moved by you</span>
              <span>{a.moved > 0 ? "+" : "−"}{money(Math.abs(a.moved))}</span>
            </li>
          )}
          {day === today && a.spent > 0 && (
            <li>
              <span>Spent so far</span>
              <span>−{money(a.spent)}</span>
            </li>
          )}
          {held > 0 && (
            <li>
              <span>Held back to stay above your floor</span>
              <span>−{money(held)}</span>
            </li>
          )}
          <li className="strong">
            <span>{day === today ? "Left today" : "To spend that day"}</span>
            <span>{money(a.amount)}</span>
          </li>
        </ul>
      )}
      {past && (
        <div className="field">
          <span>{day === today ? "How much did you spend today?" : "How much did you spend that day?"}</span>
          <div className="row">
            <div className="money-input grow">
              <span>$</span>
              <input className="input" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" aria-label="Spent that day" />
            </div>
            <button className="btn btn-sm btn-primary" disabled={total === "" || Number(total) === logged} onClick={saveTotal}>
              Save
            </button>
          </div>
          {!logged && (
            <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} disabled={marked} onClick={noSpend}>
              {marked ? "✓ No spending" : "Didn't spend anything"}
            </button>
          )}
          <span className="small faint">What you don&apos;t spend rolls onto the next day by itself. Fun money only; bills and categories are separate.</span>
        </div>
      )}
      {a && a.amount > 0 && (
        <div className="field">
          <span>Move some to another day</span>
          <div className="chips">
            {days
              .filter((d) => d.day !== day)
              .map((d) => (
                <button key={d.day} type="button" className="chip chip-sm" onClick={() => onMove(d.day)}>
                  {dayName(d.day, today)}
                </button>
              ))}
          </div>
        </div>
      )}
      {mine.length > 0 && (
        <div className="stack-sm">
          {mine.map((m) => (
            <div key={m.id} className="row-between small">
              <span>
                {money(Number(m.amount))} {m.from_day === day ? `moved to ${dayName(m.to_day, today)}` : `moved here from ${dayName(m.from_day, today)}`}
              </span>
              <button className="btn-link small" onClick={() => undoMove(m)}>
                undo
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MoveForm({ draft, days, today, fp, onDone, toast }: { draft: { from: string; to: string }; days: DayAllowance[]; today: string; fp: FloorPlan; onDone: () => void; toast: (m: string) => void }) {
  const { meId } = useApp();
  const from = days.find((d) => d.day === draft.from);
  const max = from ? Math.floor(from.amount) : 0;
  const [amount, setAmount] = useState(String(max));
  const periodOf = (day: string) => fp.periods.find((p) => day >= p.start && day < p.end)?.start ?? "";
  // Pulling money earlier from a later paycheck could dip you under your
  // floor before it lands; and a later paycheck's money can only move within
  // that paycheck until it lands (its plan isn't settled yet).
  const samePay = periodOf(draft.to) === periodOf(draft.from);
  const borrowing = !samePay && (draft.to < draft.from || periodOf(draft.from) !== fp.periods[0]?.start);

  async function save() {
    const n = Number(amount);
    if (!(n > 0)) return;
    if (n > max) return toast(`${dayName(draft.from, today)} only has ${money(max)}.`);
    const { error } = await supabaseBrowser().from("budget_moves").insert({ owner: meId, from_day: draft.from, to_day: draft.to, amount: n });
    if (error) return toast(error.message);
    refreshAll();
    toast(`Moved ${money(n)} to ${dayName(draft.to, today)}`);
    onDone();
  }

  if (borrowing)
    return (
      <div className="stack">
        <p className="small">
          {draft.to < draft.from
            ? "That's money from a later paycheck. Spending it before it lands could put you under your floor, so it can only move later, not earlier."
            : "That paycheck hasn't landed yet, so its money can only move between its own days for now."}{" "}
          Money from now until payday can move to any day ahead.
        </p>
        <button className="btn" onClick={onDone}>
          Okay
        </button>
      </div>
    );
  return (
    <div className="stack">
      <p className="small">
        From <strong>{dayName(draft.from, today)}</strong> ({money(max)}) to <strong>{dayName(draft.to, today)}</strong>
      </p>
      <div className="money-input">
        <span>$</span>
        <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} aria-label="How much" autoFocus />
      </div>
      <button className="btn btn-primary btn-block" disabled={!(Number(amount) > 0) || max <= 0} onClick={save}>
        Move it
      </button>
    </div>
  );
}
