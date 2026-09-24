"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useNow } from "@/lib/dates";
import {
  CHECKIN_OPTIONS,
  RANGES,
  money,
  planGoal,
  unitName,
  type Goal,
  type GoalLog,
  type GoalMode,
  type WhenKind,
} from "@/lib/goals";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { WhenPicker } from "./WhenPicker";

/* ─── data ──────────────────────────────────────────────────────────────── */

export function useGoals() {
  const supabase = supabaseBrowser();
  const { data: goals = [] } = useLive<Goal[]>(
    "goals",
    async () => {
      // RLS already limits this to shared goals and your own private ones.
      const { data, error } = await supabase.from("goals").select("*, goal_items(id, label, amount, position)").order("created_at");
      if (error) throw error;
      return data as Goal[];
    },
    ["goals", "goal_items"],
  );
  const { data: logs = [] } = useLive<GoalLog[]>(
    "goal_logs",
    async () => {
      const { data, error } = await supabase.from("goal_logs").select("*").order("created_at");
      if (error) throw error;
      return data as GoalLog[];
    },
    ["goal_logs"],
  );
  return { goals, logs };
}

/** How many savings check-ins are waiting (for the Home overview). */
export function useGoalCheckins() {
  const { goals, logs } = useGoals();
  const now = useNow();
  if (!now) return 0;
  return goals.filter((g) => !g.archived_at && planGoal(g, logs.filter((l) => l.goal_id === g.id), now).due).length;
}

async function log(goalId: string, meId: string, kind: GoalLog["kind"], amount: number, extra: { checkin_for?: string; note?: string | null } = {}) {
  const { error } = await supabaseBrowser()
    .from("goal_logs")
    .insert({ goal_id: goalId, kind, amount, checkin_for: extra.checkin_for ?? null, note: extra.note ?? null, created_by: meId });
  refreshAll();
  return error;
}

/* ─── bits ──────────────────────────────────────────────────────────────── */

function Progress({ saved, total }: { saved: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.max(0, Math.round((saved / total) * 100))) : 0;
  return (
    <div className="goal-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="goal-bar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="small muted">
        {money(saved)} of {money(total)} · {pct}%
      </span>
    </div>
  );
}

function whenText(g: Goal) {
  if (g.mode === "habit") return null;
  if (g.when_kind === "date" && g.target_date) return `Happening ${format(parseISO(g.target_date), "MMM d, yyyy")}`;
  if (g.when_kind === "range") {
    const r = RANGES.find((x) => x.from === g.range_from_days && x.to === g.range_to_days);
    return `In ${r?.label ?? `${g.range_from_days}–${g.range_to_days} days`} (from ${format(parseISO(g.start_date), "MMM d")})`;
  }
  return "No timeline";
}

function suggestText(g: Goal, p: ReturnType<typeof planGoal>) {
  if (g.mode === "habit") return g.habit_amount ? `${money(Number(g.habit_amount))} every ${unitName(p.every)}` : null;
  if (!p.suggest) return null;
  const [a, b] = p.suggest;
  if (p.remaining <= 0) return null;
  return a === b ? `Save ${money(a)} every ${unitName(p.every)}` : `Save ${money(b)}–${money(a)} every ${unitName(p.every)}`;
}

/** "Did you add $X?" Yes logs it; a different amount logs that; "not this time" just clears the ask. */
function CheckIn({ g, due }: { g: Goal; due: { date: string; amount: number } }) {
  const { meId, toast } = useApp();
  const [other, setOther] = useState<string | null>(null);
  async function answer(kind: "add" | "skip", amount: number) {
    const err = await log(g.id, meId, kind, amount, { checkin_for: due.date });
    if (err) return toast(err.message);
    toast(kind === "add" ? `Logged ${money(amount)} 💰` : "No worries. Next time.");
  }
  return (
    <div className="goal-checkin" onClick={(e) => e.stopPropagation()}>
      <span>
        Did you add <strong>{money(due.amount)}</strong> to this?
      </span>
      {other === null ? (
        <div className="row wrap">
          <button className="btn btn-sm btn-primary" onClick={() => answer("add", due.amount)}>
            Yes, added
          </button>
          <button className="btn btn-sm" onClick={() => setOther("")}>
            A different amount
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => answer("skip", 0)}>
            Not this time
          </button>
        </div>
      ) : (
        <form
          className="quick-add"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(other);
            if (n > 0) answer("add", n);
          }}
        >
          <input className="input grow" inputMode="decimal" value={other} onChange={(e) => setOther(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Amount" autoFocus aria-label="Amount added" />
          <button className="btn btn-primary" disabled={!(Number(other) > 0)}>
            Log
          </button>
        </form>
      )}
    </div>
  );
}

/* ─── list ──────────────────────────────────────────────────────────────── */

export function GoalsView() {
  const { goals, logs } = useGoals();
  const now = useNow();
  const [tab, setTab] = useState<"mine" | "ours" | "archived">("mine");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  if (!now) return null;

  const shown = goals.filter((g) => (tab === "archived" ? !!g.archived_at : !g.archived_at && (tab === "ours" ? g.shared : !g.shared)));
  const openGoal = goals.find((g) => g.id === open);

  return (
    <div className="stack">
      <div className="seg" role="group" aria-label="Which goals">
        <button aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>
          Just mine
        </button>
        <button aria-pressed={tab === "ours"} onClick={() => setTab("ours")}>
          Ours
        </button>
        <button aria-pressed={tab === "archived"} onClick={() => setTab("archived")}>
          Archived
        </button>
      </div>
      <p className="small muted">
        {tab === "mine"
          ? "Private. Only you can see these, amounts and all."
          : tab === "ours"
            ? "Shared plans. Money saved only shows on the ones you set to track it."
            : "Out of sight, history kept. Bring one back any time."}
      </p>
      {tab !== "archived" && (
        <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setAdding(true)}>
          ＋ New goal
        </button>
      )}

      {shown.length === 0 ? (
        <p className="muted">{tab === "archived" ? "Nothing archived." : "No goals yet. A trip, a couch, a rainy-day fund…"}</p>
      ) : (
        shown.map((g) => {
          const gl = logs.filter((l) => l.goal_id === g.id);
          const p = planGoal(g, gl, now);
          const tip = suggestText(g, p);
          return (
            <div key={g.id} className="card goal-card" role="button" tabIndex={0} onClick={() => setOpen(g.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(g.id)}>
              <div className="row-between">
                <strong>
                  {g.emoji ? `${g.emoji} ` : ""}
                  {g.name}
                </strong>
                {g.mode !== "habit" && <span className="goal-total">{money(p.total)}</span>}
              </div>
              {whenText(g) && <span className="small muted">{whenText(g)}</span>}
              {p.saved !== null && g.mode !== "habit" && p.total > 0 && <Progress saved={p.saved} total={p.total} />}
              {p.saved !== null && g.mode === "habit" && <span className="small">Saved so far: {money(p.saved)}</span>}
              {p.met && <span className="sticker sage">🎉 Fully saved</span>}
              {tip && <span className="small goal-tip">{tip}</span>}
              {p.due && !g.archived_at && <CheckIn g={g} due={p.due} />}
            </div>
          );
        })
      )}

      {adding && (
        <Sheet title="New goal" onClose={() => setAdding(false)}>
          <GoalForm shared={tab === "ours"} onDone={(id) => (setAdding(false), id && setOpen(id))} />
        </Sheet>
      )}
      {openGoal && <GoalSheet g={openGoal} logs={logs.filter((l) => l.goal_id === openGoal.id)} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ─── one goal ──────────────────────────────────────────────────────────── */

function GoalSheet({ g, logs, onClose }: { g: Goal; logs: GoalLog[]; onClose: () => void }) {
  const { meId, nameOf, toast } = useApp();
  const now = useNow() ?? new Date();
  const [editing, setEditing] = useState(false);
  const [money_, setMoney] = useState<{ kind: "add" | "withdraw" | "balance"; amount: string; note: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const p = planGoal(g, logs, now);
  const tip = suggestText(g, p);
  const supabase = supabaseBrowser();

  async function archive(on: boolean) {
    await supabase.from("goals").update({ archived_at: on ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", g.id);
    refreshAll();
    toast(on ? "Archived. The history's kept." : "Back on the list");
    if (on) onClose();
  }

  async function saveMoney(e: React.FormEvent) {
    e.preventDefault();
    if (!money_) return;
    const n = Number(money_.amount);
    if (!(n >= 0) || money_.amount === "") return;
    const err = await log(g.id, meId, money_.kind, n, { note: money_.note.trim() || null });
    if (err) return toast(err.message);
    setMoney(null);
    toast("Logged");
  }

  if (editing) {
    return (
      <Sheet title={`Edit ${g.name}`} onClose={() => setEditing(false)}>
        <GoalForm initial={g} shared={g.shared} onDone={() => setEditing(false)} />
      </Sheet>
    );
  }

  const items = [...g.goal_items].sort((a, b) => a.position - b.position);
  const history = [...logs].filter((l) => l.kind !== "skip").reverse();

  return (
    <Sheet title={`${g.emoji ? `${g.emoji} ` : ""}${g.name}`} onClose={onClose}>
      <div className="stack">
        <div className="row-between">
          <span className="small muted">{g.shared ? "Ours" : "Just mine · private"}</span>
          {g.mode !== "habit" && <strong className="goal-total">{money(p.total)}</strong>}
        </div>
        {whenText(g) && <span className="small muted">{whenText(g)}</span>}

        {g.mode === "plan" && items.length > 0 && (
          <div className="card" style={{ padding: "4px 14px" }}>
            {items.map((i) => (
              <div key={i.id} className="goal-line">
                <span>{i.label}</span>
                <span>{money(Number(i.amount))}</span>
              </div>
            ))}
            <div className="goal-line goal-line-total">
              <span>Total</span>
              <span>{money(p.total)}</span>
            </div>
          </div>
        )}

        {p.saved !== null && g.mode !== "habit" && p.total > 0 && <Progress saved={p.saved} total={p.total} />}
        {p.saved !== null && g.mode === "habit" && <p>Saved so far: {money(p.saved)}</p>}
        {tip && <p className="goal-tip">{tip}</p>}
        {p.due && !g.archived_at && <CheckIn g={g} due={p.due} />}

        {g.track && !g.archived_at && (
          <div className="stack-sm">
            {money_ ? (
              <form className="stack-sm" onSubmit={saveMoney}>
                <span className="small muted">
                  {money_.kind === "add" ? "Money added" : money_.kind === "withdraw" ? "Money taken out" : "What the account is at now"}
                </span>
                <input className="input" inputMode="decimal" value={money_.amount} onChange={(e) => setMoney({ ...money_, amount: e.target.value.replace(/[^\d.]/g, "") })} placeholder="$" autoFocus aria-label="Amount" />
                <input className="input" value={money_.note} onChange={(e) => setMoney({ ...money_, note: e.target.value })} placeholder="Note (optional)" aria-label="Note" />
                <div className="row">
                  <button className="btn btn-primary btn-sm" disabled={money_.amount === ""}>
                    Save
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMoney(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="row wrap">
                <button className="btn btn-sm" onClick={() => setMoney({ kind: "add", amount: "", note: "" })}>
                  + Added money
                </button>
                <button className="btn btn-sm" onClick={() => setMoney({ kind: "withdraw", amount: "", note: "" })}>
                  − Took some out
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setMoney({ kind: "balance", amount: "", note: "" })}>
                  Set new balance
                </button>
              </div>
            )}
          </div>
        )}

        {g.track && history.length > 0 && (
          <details>
            <summary className="small muted">Savings log ({history.length})</summary>
            <div className="stack-sm" style={{ marginTop: 6 }}>
              {history.map((l) => (
                <div key={l.id} className="goal-line small">
                  <span>
                    {format(parseISO(l.created_at), "MMM d, yyyy")} · {l.kind === "add" ? "Added" : l.kind === "withdraw" ? "Took out" : "Balance set to"}
                    {g.shared ? ` · ${l.created_by === meId ? "you" : nameOf(l.created_by)}` : ""}
                    {l.note ? ` · ${l.note}` : ""}
                  </span>
                  <span>
                    {l.kind === "withdraw" ? "−" : l.kind === "add" ? "+" : ""}
                    {money(Number(l.amount))}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
        {g.notes && <p className="card" style={{ whiteSpace: "pre-wrap" }}>{g.notes}</p>}

        <div className="row wrap">
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            Edit plan
          </button>
          {g.archived_at ? (
            <button className="btn btn-sm" onClick={() => archive(false)}>
              Bring it back
            </button>
          ) : (
            <button className="btn btn-sm btn-ghost" onClick={() => archive(true)}>
              Archive
            </button>
          )}
        </div>
        {g.archived_at && (
          <button className="btn-link small" style={{ alignSelf: "flex-start", color: "var(--danger)" }} onClick={() => setDeleting(true)}>
            Delete forever…
          </button>
        )}
      </div>
      {deleting && <DeleteGoal g={g} onClose={() => setDeleting(false)} onDeleted={onClose} />}
    </Sheet>
  );
}

/** Deleting takes the whole history with it, so it's deliberately a few steps (and only from Archived). */
function DeleteGoal({ g, onClose, onDeleted }: { g: Goal; onClose: () => void; onDeleted: () => void }) {
  const { toast } = useApp();
  const [typed, setTyped] = useState("");
  const [sure, setSure] = useState(false);
  const match = typed.trim().toLowerCase() === g.name.trim().toLowerCase();
  async function del() {
    if (!confirm(`Last check: delete "${g.name}" and every log in it? This can't be undone.`)) return;
    const { error } = await supabaseBrowser().from("goals").delete().eq("id", g.id);
    if (error) return toast(error.message);
    refreshAll();
    toast("Deleted");
    onClose();
    onDeleted();
  }
  return (
    <Sheet title="Delete forever?" onClose={onClose}>
      <div className="stack">
        <p>
          Archiving already hides it. Deleting also erases its plan and every savings log, for good. If this could ever be a goal again, keep it archived instead.
        </p>
        <label className="row small">
          <input type="checkbox" className="check" checked={sure} onChange={(e) => setSure(e.target.checked)} />I understand the history goes too
        </label>
        {sure && (
          <label className="field">
            <span>Type “{g.name}” to confirm</span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
        )}
        <div className="row-between">
          <button className="btn btn-primary" onClick={onClose}>
            Keep it archived
          </button>
          <button className="btn btn-ghost" disabled={!sure || !match} onClick={del} style={{ color: "var(--danger)" }}>
            Delete
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/* ─── new / edit ────────────────────────────────────────────────────────── */

const LINE_IDEAS = ["Flights", "Hotel", "Food", "Fun money", "Gas", "Tickets"];

type Line = { id?: string; label: string; amount: string };

export function GoalForm({ initial, shared: sharedDefault = false, onDone }: { initial?: Goal; shared?: boolean; onDone: (id?: string) => void }) {
  const { meId, partner, toast } = useApp();
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "");
  const [shared, setShared] = useState(initial?.shared ?? sharedDefault);
  // Private goals track by default; shared ones only if you turn it on.
  const [track, setTrack] = useState(initial?.track ?? !sharedDefault);
  const [mode, setMode] = useState<GoalMode>(initial?.mode ?? "plan");
  const [lines, setLines] = useState<Line[]>(
    initial?.goal_items.length ? [...initial.goal_items].sort((a, b) => a.position - b.position).map((i) => ({ id: i.id, label: i.label, amount: String(i.amount) })) : [{ label: "", amount: "" }],
  );
  const [total, setTotal] = useState(initial?.target_amount != null ? String(initial.target_amount) : "");
  const [habit, setHabit] = useState(initial?.habit_amount != null ? String(initial.habit_amount) : "");
  const [whenKind, setWhenKind] = useState<WhenKind>(initial?.when_kind ?? "none");
  const [date, setDate] = useState<string | null>(initial?.target_date ?? null);
  const [range, setRange] = useState<{ from: number; to: number } | null>(
    initial?.range_from_days != null && initial.range_to_days != null ? { from: initial.range_from_days, to: initial.range_to_days } : null,
  );
  const [propose, setPropose] = useState(initial?.propose ?? true);
  const [every, setEvery] = useState<number | null>(initial?.checkin_days ?? null);
  const [customEvery, setCustomEvery] = useState("");
  const [already, setAlready] = useState("");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;
  const lineTotal = lines.reduce((s, l) => s + num(l.amount), 0);
  const moneyInput = (v: string) => v.replace(/[^\d.]/g, "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const supabase = supabaseBrowser();
    const row = {
      name: name.trim(),
      emoji: emoji.trim() || null,
      shared,
      owner: shared ? null : (initial?.owner ?? meId),
      track,
      mode,
      target_amount: mode === "total" ? num(total) : null,
      habit_amount: mode === "habit" ? num(habit) : null,
      when_kind: mode === "habit" ? "none" : whenKind,
      target_date: whenKind === "date" ? date : null,
      range_from_days: whenKind === "range" ? (range?.from ?? null) : null,
      range_to_days: whenKind === "range" ? (range?.to ?? null) : null,
      propose: mode === "habit" ? true : propose,
      checkin_days: every,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const res = initial
      ? await supabase.from("goals").update(row).eq("id", initial.id).select("id").single()
      : await supabase.from("goals").insert({ ...row, created_by: meId }).select("id").single();
    if (res.error) {
      setBusy(false);
      return toast(res.error.message);
    }
    const id = res.data.id as string;
    if (mode === "plan") {
      const keep = lines.filter((l) => l.label.trim());
      const keepIds = keep.flatMap((l) => (l.id ? [l.id] : []));
      const gone = (initial?.goal_items ?? []).filter((i) => !keepIds.includes(i.id)).map((i) => i.id);
      if (gone.length) await supabase.from("goal_items").delete().in("id", gone);
      await Promise.all(
        keep.map((l, position) =>
          l.id
            ? supabase.from("goal_items").update({ label: l.label.trim(), amount: num(l.amount), position }).eq("id", l.id)
            : supabase.from("goal_items").insert({ goal_id: id, label: l.label.trim(), amount: num(l.amount), position }),
        ),
      );
    }
    if (!initial && track && num(already) > 0) await supabase.from("goal_logs").insert({ goal_id: id, kind: "balance", amount: num(already), note: "Starting amount", created_by: meId });
    setBusy(false);
    refreshAll();
    toast(initial ? "Saved" : "Goal set 💰");
    onDone(id);
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="row">
        <input className="input" style={{ width: 64, textAlign: "center" }} value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} placeholder="🏝️" aria-label="Emoji (optional)" />
        <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rhode Island trip" autoFocus={!initial} required />
      </div>

      <div className="field">
        <span>Whose</span>
        <div className="seg" role="group">
          <button type="button" aria-pressed={!shared} onClick={() => (setShared(false), setTrack(true))}>
            Just mine
          </button>
          <button type="button" aria-pressed={shared} onClick={() => (setShared(true), setTrack(initial?.shared ? initial.track : false))}>
            Ours
          </button>
        </div>
        <p className="small muted">{shared ? `${partner?.display_name ?? "They"} can see the plan.` : "Private: only you can see it."}</p>
      </div>

      <div className="toggle-row">
        <span className="label">{shared ? "Track money saved (both of you see it)" : "Track what I've saved"}</span>
        <label className="switch">
          <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} />
          <span />
        </label>
      </div>

      <div className="field">
        <span>How it works</span>
        <div className="seg" role="group">
          <button type="button" aria-pressed={mode === "plan"} onClick={() => setMode("plan")}>
            Add up costs
          </button>
          <button type="button" aria-pressed={mode === "total"} onClick={() => setMode("total")}>
            One total
          </button>
          <button type="button" aria-pressed={mode === "habit"} onClick={() => setMode("habit")}>
            Regular saving
          </button>
        </div>
      </div>

      {mode === "plan" && (
        <div className="field">
          <span>What it&apos;ll cost</span>
          {lines.map((l, i) => (
            <div key={i} className="row">
              <input className="input grow" value={l.label} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Hotel" aria-label="What" />
              <input className="input" style={{ width: 110 }} inputMode="decimal" value={l.amount} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: moneyInput(e.target.value) } : x)))} placeholder="$" aria-label="How much" />
              <button type="button" className="icon-btn" onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : [{ label: "", amount: "" }])} aria-label="Remove line">
                ×
              </button>
            </div>
          ))}
          <div className="chips">
            <button type="button" className="chip chip-sm" onClick={() => setLines([...lines, { label: "", amount: "" }])}>
              + Line
            </button>
            {LINE_IDEAS.filter((x) => !lines.some((l) => l.label.trim().toLowerCase() === x.toLowerCase())).map((x) => (
              <button
                key={x}
                type="button"
                className="chip chip-sm"
                onClick={() => {
                  const blank = lines.findIndex((l) => !l.label.trim() && !l.amount);
                  setLines(blank >= 0 ? lines.map((l, j) => (j === blank ? { ...l, label: x } : l)) : [...lines, { label: x, amount: "" }]);
                }}
              >
                + {x}
              </button>
            ))}
          </div>
          <div className="goal-line goal-line-total">
            <span>Total</span>
            <span>{money(lineTotal)}</span>
          </div>
        </div>
      )}
      {mode === "total" && (
        <label className="field">
          <span>How much</span>
          <input className="input" inputMode="decimal" value={total} onChange={(e) => setTotal(moneyInput(e.target.value))} placeholder="$1,500" />
        </label>
      )}
      {mode === "habit" && (
        <label className="field">
          <span>Put away each time</span>
          <input className="input" inputMode="decimal" value={habit} onChange={(e) => setHabit(moneyInput(e.target.value))} placeholder="$20" />
        </label>
      )}

      {mode !== "habit" && (
        <div className="field">
          <span>When is it?</span>
          <div className="seg" role="group">
            <button type="button" aria-pressed={whenKind === "none"} onClick={() => setWhenKind("none")}>
              No timeline
            </button>
            <button type="button" aria-pressed={whenKind === "range"} onClick={() => setWhenKind("range")}>
              Roughly
            </button>
            <button type="button" aria-pressed={whenKind === "date"} onClick={() => setWhenKind("date")}>
              On a date
            </button>
          </div>
          {whenKind === "range" && (
            <div className="chips">
              {RANGES.map((r) => (
                <button key={r.label} type="button" className="chip chip-sm" aria-pressed={range?.from === r.from && range?.to === r.to} onClick={() => setRange({ from: r.from, to: r.to })}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
          {whenKind === "date" && <WhenPicker mode="day" allowAllDay={false} placeholder="Pick the day" value={date ? { date } : null} onChange={(w) => setDate(w.date)} />}
        </div>
      )}

      {mode !== "habit" && whenKind !== "none" && (
        <div className="toggle-row">
          <span className="label">Suggest how much to save {track ? "and check in" : ""}</span>
          <label className="switch">
            <input type="checkbox" checked={propose} onChange={(e) => setPropose(e.target.checked)} />
            <span />
          </label>
        </div>
      )}

      {(mode === "habit" || (propose && whenKind !== "none")) && (
        <div className="field">
          <span>{track ? "Check in" : "Plan it by"}</span>
          <div className="chips">
            {mode !== "habit" && (
              <button type="button" className="chip chip-sm" aria-pressed={every === null} onClick={() => setEvery(null)}>
                Auto
              </button>
            )}
            {CHECKIN_OPTIONS.map((o) => (
              <button key={o.days} type="button" className="chip chip-sm" aria-pressed={every === o.days || (mode === "habit" && every === null && o.days === 30)} onClick={() => setEvery(o.days)}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="row">
            <input className="input" style={{ width: 90 }} inputMode="numeric" value={customEvery} onChange={(e) => setCustomEvery(e.target.value.replace(/\D/g, ""))} placeholder="Days" aria-label="Every how many days" />
            <button type="button" className="btn btn-sm" disabled={!(Number(customEvery) >= 1 && Number(customEvery) <= 366)} onClick={() => setEvery(Number(customEvery))}>
              Every {customEvery || "…"} days
            </button>
          </div>
          {track && <p className="small muted">Each time, it&apos;ll ask “did you add that amount?” Yes logs it. It stops once you&apos;re there.</p>}
        </div>
      )}

      {!initial && track && (
        <label className="field">
          <span>Already saved (optional)</span>
          <input className="input" inputMode="decimal" value={already} onChange={(e) => setAlready(moneyInput(e.target.value))} placeholder="$0" />
        </label>
      )}
      <textarea className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" aria-label="Notes" />

      <button className="btn btn-primary btn-block" disabled={busy || !name.trim() || (whenKind === "date" && mode !== "habit" && !date) || (whenKind === "range" && mode !== "habit" && !range)}>
        {initial ? "Save" : "Set the goal"}
      </button>
    </form>
  );
}
