"use client";

import { useUrlTab } from "@/lib/links";
import { useState } from "react";
import Link from "next/link";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { ago, useNow } from "@/lib/dates";
import { DOGS, dogName, type DogId } from "@/lib/dogs";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { TrainingMap } from "./TrainingMap";
import { TrainingLog } from "./TrainingLog";

// Pup parenting: being the dog parent you want to be.
//   Sessions → training report cards and progress (TrainingLog)
//   Rules    → why each exists, whether it's still needed, how strict, a gentler way
//   Collar   → how often the e-collar gets used and at what levels, with nudges
//   Training → a map of concepts/plans and how they connect (TrainingMap)
//   Notes    → quiet notes (not posted to the feed)

export interface PupRule {
  id: string;
  dog: string;
  title: string;
  origin: string | null;
  concern: string | null;
  still_needed: "yes" | "unsure" | "no";
  strictness: number;
  gentler: string | null;
  reviewed_at: string | null;
  retired: boolean;
  created_at: string;
}
interface CollarLog {
  id: string;
  dog: string;
  logged_by: string;
  day: string;
  used: boolean;
  levels: number[];
  context: string | null;
  created_at: string;
}
interface PupNote {
  id: string;
  dog: string;
  author: string;
  text: string;
  created_at: string;
}

// The lines Charlie set for herself: nudge past these (last 14 days).
export const COLLAR_USE_LINE = 0.4;
export const COLLAR_LEVEL_LINE = 30;
const WINDOW = 14;
const REVIEW_EVERY = 30; // days before a rule asks to be checked again

export const STRICT: Record<number, string> = { 1: "Relaxed", 2: "Light", 3: "Firm", 4: "Strict", 5: "Locked down" };
const NEEDED: Record<PupRule["still_needed"], string> = { yes: "Still needed", unsure: "Not sure", no: "Not needed" };
const CONTEXTS = ["walk", "recall", "off-leash", "house", "visitors", "other"];

function useTable<T>(table: string, dog: string, order = "created_at") {
  const { data = [] } = useLive<T[]>(
    `${table}:${dog}`,
    async () => {
      const { data, error } = await supabaseBrowser().from(table).select("*").eq("dog", dog).order(order, { ascending: false });
      if (error) throw error;
      return data as T[];
    },
    [table],
  );
  return data;
}

export function PupView() {
  const [dog, setDog] = useUrlTab<DogId>(DOGS.map((d) => d.id), "wiley", "dog");
  const [tab, setTab] = useUrlTab(["sessions", "rules", "collar", "map", "notes"] as const, "sessions");
  return (
    <div className="stack">
      <div className="row-between wrap" style={{ gap: 8 }}>
        <div className="chips" role="group" aria-label="Which dog">
          {DOGS.map((d) => (
            <button key={d.id} className="chip" aria-pressed={dog === d.id} onClick={() => setDog(d.id)}>
              {d.name}
            </button>
          ))}
        </div>
      </div>
      <div className="chips pup-tabs" role="group" aria-label="Pup parenting">
        {(
          [
            ["sessions", "📋 Sessions"],
            ["rules", "📏 Rules"],
            ["collar", "📟 Collar"],
            ["map", "🌳 Training"],
            ["notes", "📝 Notes"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "sessions" && <TrainingLog dog={dog} />}
      {tab === "rules" && <Rules dog={dog} />}
      {tab === "collar" && <Collar dog={dog} />}
      {tab === "map" && <TrainingMap dog={dog} />}
      {tab === "notes" && <Notes dog={dog} />}
    </div>
  );
}

/* ─── rules ──────────────────────────────────────────────────────────────── */

const reviewDue = (r: PupRule, now: Date) => !r.reviewed_at || differenceInCalendarDays(now, parseISO(r.reviewed_at)) >= REVIEW_EVERY;

function Strictness({ n }: { n: number }) {
  return (
    <span className="pup-strict" aria-label={`Strictness ${n} of 5: ${STRICT[n]}`}>
      {[1, 2, 3, 4, 5].map((k) => (
        <span key={k} className={k <= n ? "on" : ""} />
      ))}
      <span className="small">{STRICT[n]}</span>
    </span>
  );
}

function Rules({ dog }: { dog: string }) {
  const now = useNow();
  const rules = useTable<PupRule>("pup_rules", dog);
  const [editing, setEditing] = useState<PupRule | "new" | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  if (!now) return null;
  const active = rules.filter((r) => !r.retired);
  const retired = rules.filter((r) => r.retired);
  const due = active.filter((r) => reviewDue(r, now));
  const avg = active.length ? active.reduce((a, r) => a + r.strictness, 0) / active.length : 0;

  return (
    <div className="stack">
      <section className="card fit-card">
        <div className="row-between">
          <strong>Check yourself</strong>
          <span className="small faint">{active.length ? `avg strictness ${avg.toFixed(1)} / 5` : ""}</span>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {active.length === 0
            ? `Add the rules you have for ${dogName(dog)}: where they came from, what they protect against, and how locked down they are.`
            : due.length
              ? `${due.length} rule${due.length === 1 ? "" : "s"} ${due.length === 1 ? "hasn't" : "haven't"} been checked in ${REVIEW_EVERY}+ days. A quick look: still needed? Still this strict?`
              : "Every rule's been checked recently. 💛"}
        </p>
        <div className="row" style={{ gap: 8 }}>
          {active.length > 0 && (
            <button className="btn btn-sm btn-primary" onClick={() => setReviewing(true)}>
              🔍 Check-in{due.length ? ` (${due.length})` : ""}
            </button>
          )}
          <button className="btn btn-sm" onClick={() => setEditing("new")}>
            ＋ Rule
          </button>
        </div>
      </section>

      {active.map((r) => (
        <section key={r.id} className={`card pup-rule${r.still_needed !== "yes" ? " soft" : ""}`}>
          <button className="pup-rule-head" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
            <span className="grow">
              <strong>{r.title}</strong>
              <span className="row wrap" style={{ gap: 8, marginTop: 4 }}>
                <Strictness n={r.strictness} />
                <span className={`pup-needed ${r.still_needed}`}>{NEEDED[r.still_needed]}</span>
                {reviewDue(r, now) && <span className="pup-needed due">check-in due</span>}
              </span>
            </span>
            <span aria-hidden>{open === r.id ? "▾" : "▸"}</span>
          </button>
          {open === r.id && (
            <div className="stack-sm pup-rule-body">
              {r.origin && (
                <p>
                  <span className="small faint">Where it came from</span>
                  <br />
                  {r.origin}
                </p>
              )}
              {r.concern && (
                <p>
                  <span className="small faint">The safety concern</span>
                  <br />
                  {r.concern}
                </p>
              )}
              {r.gentler && (
                <p>
                  <span className="small faint">A gentler way to cover it</span>
                  <br />
                  {r.gentler}
                </p>
              )}
              <span className="small faint">{r.reviewed_at ? `Last checked ${ago(r.reviewed_at)}` : "Never checked yet"}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => setEditing(r)}>
                Edit
              </button>
            </div>
          )}
        </section>
      ))}

      {retired.length > 0 && (
        <button className="btn-link small" onClick={() => setShowRetired((x) => !x)}>
          {showRetired ? "Hide" : "Show"} retired rules ({retired.length})
        </button>
      )}
      {showRetired &&
        retired.map((r) => (
          <button key={r.id} className="card pup-rule soft pup-rule-head" onClick={() => setEditing(r)}>
            <span className="grow">
              <s>{r.title}</s> <span className="small faint">retired · tap to bring back or edit</span>
            </span>
          </button>
        ))}

      {editing && <RuleSheet dog={dog} rule={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {reviewing && <ReviewSheet rules={due.length ? due : active} onClose={() => setReviewing(false)} />}
    </div>
  );
}

function RuleSheet({ dog, rule, onClose }: { dog: string; rule: PupRule | null; onClose: () => void }) {
  const { toast } = useApp();
  const [title, setTitle] = useState(rule?.title ?? "");
  const [origin, setOrigin] = useState(rule?.origin ?? "");
  const [concern, setConcern] = useState(rule?.concern ?? "");
  const [strictness, setStrictness] = useState(rule?.strictness ?? 3);
  const [needed, setNeeded] = useState<PupRule["still_needed"]>(rule?.still_needed ?? "yes");
  const [gentler, setGentler] = useState(rule?.gentler ?? "");
  const db = supabaseBrowser();
  async function save(extra: Partial<PupRule> = {}) {
    if (!title.trim()) return toast("Give the rule a name");
    const row = { dog, title: title.trim(), origin: origin.trim() || null, concern: concern.trim() || null, strictness, still_needed: needed, gentler: gentler.trim() || null, ...extra };
    const { error } = rule ? await db.from("pup_rules").update(row).eq("id", rule.id) : await db.from("pup_rules").insert(row);
    if (error) return toast(error.message);
    refreshAll();
    onClose();
  }
  return (
    <Sheet title={rule ? "Edit rule" : `New rule for ${dogName(dog)}`} onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>The rule</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. leash on until the car door closes" autoFocus={!rule} />
        </label>
        <label className="field">
          <span>Where it came from</span>
          <textarea className="textarea" rows={2} value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="what happened, or who suggested it" />
        </label>
        <label className="field">
          <span>The safety concern it covers</span>
          <textarea className="textarea" rows={2} value={concern} onChange={(e) => setConcern(e.target.value)} placeholder="what you're actually protecting against" />
        </label>
        <StrictPicker value={strictness} onChange={setStrictness} />
        <NeededPicker value={needed} onChange={setNeeded} />
        <label className="field">
          <span>A gentler way to cover the same concern (optional)</span>
          <textarea className="textarea" rows={2} value={gentler} onChange={(e) => setGentler(e.target.value)} placeholder="management (gate, long line), a trained alternative, a smaller version of the rule…" />
        </label>
        <button className="btn btn-primary btn-block" onClick={() => save()}>
          Save
        </button>
        {rule && (
          <div className="row-between">
            <button className="btn btn-sm btn-ghost" onClick={() => save({ retired: !rule.retired })}>
              {rule.retired ? "Bring it back" : "Retire this rule"}
            </button>
            <button
              className="btn-link small faint"
              onClick={async () => {
                const { error } = await db.from("pup_rules").delete().eq("id", rule.id);
                if (error) return toast(error.message);
                refreshAll();
                onClose();
              }}
            >
              delete
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function StrictPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="field">
      <span>How locked down · {STRICT[value]}</span>
      <div className="seg seg-sm" role="group" aria-label="Strictness">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} aria-pressed={value === n} onClick={() => onChange(n)} title={STRICT[n]}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function NeededPicker({ value, onChange }: { value: PupRule["still_needed"]; onChange: (v: PupRule["still_needed"]) => void }) {
  return (
    <div className="field">
      <span>Still needed?</span>
      <div className="seg seg-sm" role="group" aria-label="Still needed">
        {(["yes", "unsure", "no"] as const).map((v) => (
          <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>
            {v === "yes" ? "Yes" : v === "unsure" ? "Not sure" : "No"}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One rule at a time: a calm check-in, not a quiz. */
function ReviewSheet({ rules, onClose }: { rules: PupRule[]; onClose: () => void }) {
  const { toast } = useApp();
  const [k, setK] = useState(0);
  const r = rules[k];
  const [needed, setNeeded] = useState(r.still_needed);
  const [strictness, setStrictness] = useState(r.strictness);
  const [gentler, setGentler] = useState(r.gentler ?? "");
  async function next(retire = false) {
    const { error } = await supabaseBrowser()
      .from("pup_rules")
      .update({ still_needed: needed, strictness, gentler: gentler.trim() || null, reviewed_at: new Date().toISOString(), ...(retire ? { retired: true } : {}) })
      .eq("id", r.id);
    if (error) return toast(error.message);
    refreshAll();
    if (k + 1 >= rules.length) {
      toast("Check-in done 💛");
      return onClose();
    }
    const n = rules[k + 1];
    setK(k + 1);
    setNeeded(n.still_needed);
    setStrictness(n.strictness);
    setGentler(n.gentler ?? "");
  }
  return (
    <Sheet title={`Check-in · ${k + 1} of ${rules.length}`} onClose={onClose}>
      <div className="stack">
        <div>
          <strong className="pup-review-title">{r.title}</strong>
          {r.origin && <p className="small muted">Started because: {r.origin}</p>}
          {r.concern && <p className="small muted">Protects against: {r.concern}</p>}
        </div>
        <ul className="pup-questions small">
          <li>Has the reason it started changed since then?</li>
          <li>What&apos;s the realistic worst case if it loosened a notch?</li>
          <li>Could management (gate, leash, long line, crate) cover the risk instead?</li>
        </ul>
        <NeededPicker value={needed} onChange={setNeeded} />
        <StrictPicker value={strictness} onChange={setStrictness} />
        <label className="field">
          <span>A gentler way to cover the same concern</span>
          <textarea className="textarea" rows={2} value={gentler} onChange={(e) => setGentler(e.target.value)} placeholder="optional" />
        </label>
        <div className="row-between">
          {needed === "no" ? (
            <button className="btn btn-sm" onClick={() => next(true)}>
              Retire it &amp; next
            </button>
          ) : (
            <span />
          )}
          <button className="btn btn-primary btn-sm" onClick={() => next()}>
            {k + 1 >= rules.length ? "Done" : "Next ›"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/* ─── e-collar ───────────────────────────────────────────────────────────── */

export function collarStats(logs: { day: string; used: boolean; levels: number[] }[], now: Date) {
  const since = format(addDays(now, -(WINDOW - 1)), "yyyy-MM-dd");
  const recent = logs.filter((l) => l.day >= since);
  const used = recent.filter((l) => l.used);
  const levels = used.flatMap((l) => l.levels);
  const useRate = recent.length ? used.length / recent.length : 0;
  const avgLevel = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
  return { sessions: recent.length, used: used.length, useRate, avgLevel, presses: levels.length };
}

function Collar({ dog }: { dog: string }) {
  const { meId, nameOf, toast } = useApp();
  const now = useNow();
  const logs = useTable<CollarLog>("collar_logs", dog);
  const [used, setUsed] = useState<boolean | null>(null);
  const [levels, setLevels] = useState<number[]>([]);
  const [level, setLevel] = useState("");
  const [context, setContext] = useState<string | null>(null);
  if (!now) return null;
  const st = collarStats(logs, now);
  const overUse = st.sessions >= 3 && st.useRate > COLLAR_USE_LINE;
  const overLevel = st.presses >= 3 && st.avgLevel > COLLAR_LEVEL_LINE;

  const addLevel = () => {
    const n = Math.round(Number(level));
    if (n >= 1 && n <= 100) setLevels([...levels, n]);
    setLevel("");
  };
  async function save() {
    if (used === null) return;
    const finalLevels = used ? (level ? [...levels, Math.round(Number(level))].filter((n) => n >= 1 && n <= 100) : levels) : [];
    const { error } = await supabaseBrowser().from("collar_logs").insert({ dog, logged_by: meId, used, levels: finalLevels, context });
    if (error) return toast(error.message);
    setUsed(null);
    setLevels([]);
    setLevel("");
    setContext(null);
    refreshAll();
    toast("Logged");
  }

  return (
    <div className="stack">
      <section className="card fit-card">
        <strong>Last {WINDOW} days</strong>
        <div className="water-stats">
          <div className={overUse ? "pup-over" : ""}>
            <strong>{st.sessions ? `${Math.round(st.useRate * 100)}%` : "–"}</strong>
            <span className="small faint">of outings used it · your line {Math.round(COLLAR_USE_LINE * 100)}%</span>
          </div>
          <div className={overLevel ? "pup-over" : ""}>
            <strong>{st.presses ? Math.round(st.avgLevel) : "–"}</strong>
            <span className="small faint">average level · your line {COLLAR_LEVEL_LINE}</span>
          </div>
          <div>
            <strong>{st.sessions}</strong>
            <span className="small faint">outings logged</span>
          </div>
        </div>
        {(overUse || overLevel) && (
          <div className="pup-nudge">
            <strong>💛 A gentle nudge</strong>
            {overUse && (
              <p>
                The collar&apos;s come out on {Math.round(st.useRate * 100)}% of outings lately, over your {Math.round(COLLAR_USE_LINE * 100)}% line. Maybe a few
                outings leaning on treats, the long line and recall games, to rebuild the yes before the tool.
              </p>
            )}
            {overLevel && (
              <p>
                Levels have averaged {Math.round(st.avgLevel)}, over your {COLLAR_LEVEL_LINE}. Worth re-finding {dogName(dog)}&apos;s working level on a calm day; it
                often sits lower than it feels in the moment.
              </p>
            )}
          </div>
        )}
        {!overUse && !overLevel && st.sessions >= 3 && <span className="small faint">Under both of your lines. 💛</span>}
      </section>

      <section className="card fit-card">
        <strong>Log an outing</strong>
        <div className="seg" role="group" aria-label="Collar used">
          <button aria-pressed={used === false} onClick={() => setUsed(false)}>
            Didn&apos;t use it
          </button>
          <button aria-pressed={used === true} onClick={() => setUsed(true)}>
            Used it
          </button>
        </div>
        {used && (
          <div className="stack-sm">
            <span className="small faint">Levels used (1–100). Add each press.</span>
            <div className="row wrap" style={{ gap: 6 }}>
              {levels.map((n, k) => (
                <button key={k} className="chip chip-sm" onClick={() => setLevels(levels.filter((_, j) => j !== k))} aria-label={`Remove ${n}`}>
                  {n} ✕
                </button>
              ))}
              <input
                className="input input-sm"
                style={{ width: 80 }}
                inputMode="numeric"
                value={level}
                onChange={(e) => setLevel(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLevel())}
                placeholder="level"
                aria-label="Level"
              />
              <button className="btn btn-sm" onClick={addLevel} disabled={!level}>
                ＋
              </button>
            </div>
          </div>
        )}
        {used !== null && (
          <div className="chips">
            {CONTEXTS.map((c) => (
              <button key={c} className="chip chip-sm" aria-pressed={context === c} onClick={() => setContext(context === c ? null : c)}>
                {c}
              </button>
            ))}
          </div>
        )}
        <button className="btn btn-primary btn-sm" disabled={used === null || (used && !levels.length && !level)} onClick={save}>
          Save
        </button>
      </section>

      {logs.length > 0 && (
        <section className="card fit-card">
          <strong>Recent</strong>
          <ul className="fit-list">
            {logs.slice(0, 20).map((l) => (
              <li key={l.id}>
                <span className="grow">
                  {l.used ? `📟 used · ${l.levels.join(", ")}` : "🌿 not used"}
                  {l.context && <span className="small faint"> · {l.context}</span>}
                  {l.logged_by !== meId && <span className="small faint"> · {nameOf(l.logged_by)}</span>}
                </span>
                <span className="small faint">{format(parseISO(l.created_at), "MMM d")}</span>
                <button
                  className="btn-link small faint"
                  aria-label="Remove"
                  onClick={async () => {
                    await supabaseBrowser().from("collar_logs").delete().eq("id", l.id);
                    refreshAll();
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ─── notes ──────────────────────────────────────────────────────────────── */

function Notes({ dog }: { dog: string }) {
  const { meId, nameOf, toast } = useApp();
  const notes = useTable<PupNote>("pup_notes", dog);
  const [text, setText] = useState("");
  return (
    <div className="stack">
      <form
        className="card fit-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          const { error } = await supabaseBrowser().from("pup_notes").insert({ dog, text: text.trim() });
          if (error) return toast(error.message);
          setText("");
          refreshAll();
        }}
      >
        <textarea className="textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={`A note about ${dogName(dog)}: what you noticed, what helped…`} aria-label="Note" />
        <div className="row-between">
          <Link href={`/dogs?dog=${dog}`} className="small">
            Post a dog note to the feed instead ›
          </Link>
          <button className="btn btn-sm btn-primary" disabled={!text.trim()}>
            Save
          </button>
        </div>
        <span className="small faint">These stay here; they don&apos;t post to the feed.</span>
      </form>
      {notes.map((n) => (
        <article key={n.id} className="card pup-note">
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{n.text}</p>
          <div className="row-between small faint">
            <span>
              {n.author === meId ? "you" : nameOf(n.author)} · {ago(n.created_at)}
            </span>
            {n.author === meId && (
              <button
                className="btn-link small faint"
                onClick={async () => {
                  await supabaseBrowser().from("pup_notes").delete().eq("id", n.id);
                  refreshAll();
                }}
              >
                delete
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
