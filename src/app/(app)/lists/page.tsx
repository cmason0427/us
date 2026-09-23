"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format, isToday, isYesterday } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { celebrate } from "@/lib/celebrate";
import { ago } from "@/lib/dates";
import { URGENCY_RANK, type KodoLog, type ListType, type PottyKind, type Task, type Urgency } from "@/lib/types";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sheet } from "@/components/Sheet";
import { DogNoteForm, PottyForm } from "@/components/QuickForms";
import { DOGS, dogName, type DogId } from "@/lib/dogs";
import { IconTrash, Paw, Sprig, Teapot, Wavy } from "@/components/Art";

type Tab = "todo" | "dogs" | "household";
const NEXT_URGENCY: Record<Urgency, Urgency> = { low: "medium", medium: "high", high: "low" };

export default function ListsPage() {
  const params = useSearchParams();
  const initialTab = params.get("tab");
  // "kodo" is the old name of the dogs tab; old links still land there.
  const [tab, setTab] = useState<Tab>(initialTab === "dogs" || initialTab === "kodo" ? "dogs" : initialTab === "household" ? "household" : "todo");
  const initialDog = DOGS.find((d) => d.id === params.get("dog"))?.id ?? DOGS[0].id;
  const pick = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", t === "todo" ? "/lists" : `/lists?tab=${t}`);
  };

  return (
    <main className="page">
      <PageHead eyebrow="Keeping track" title="Lists" art={<Sprig width={34} height={34} />} />
      <Wavy />
      <div className="seg" role="group" aria-label="List" style={{ marginBottom: 16 }}>
        <button aria-pressed={tab === "todo"} onClick={() => pick("todo")}>
          To-dos
        </button>
        <button aria-pressed={tab === "dogs"} onClick={() => pick("dogs")}>
          🐾 Dogs
        </button>
        <button aria-pressed={tab === "household"} onClick={() => pick("household")}>
          Household
        </button>
      </div>
      {tab === "todo" && <Todos />}
      {tab === "dogs" && <Dogs initialDog={initialDog} />}
      {tab === "household" && <TaskList listType="household" title="Around the house" hint="Needs doing at some point. No rush unless it's marked." />}
    </main>
  );
}

/* ─── To-dos ────────────────────────────────────────────────────────────── */

function Todos() {
  const { partner } = useApp();
  return (
    <>
      <TaskList listType="shared" title="Ours" hint="Either of you can add and check off." />
      <div className="checker" style={{ margin: "22px 0 4px" }} />
      <TaskList listType="personal" title="Just mine" hint={`Private — ${partner?.display_name ?? "they"} can't see these.`} />
    </>
  );
}

function sortTasks(list: Task[]) {
  return [...list].sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || a.created_at.localeCompare(b.created_at));
}

function TaskList({ listType, title, hint }: { listType: ListType; title: string; hint: string }) {
  const { meId, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const [draft, setDraft] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("low");
  const [showDone, setShowDone] = useState(false);

  const { data: tasks = [] } = useLive<Task[]>(
    `tasks:${listType}`,
    async () => {
      // RLS already hides the other person's personal list; the owner filter
      // is belt-and-braces.
      let q = supabase.from("tasks").select("*").eq("list_type", listType);
      if (listType === "personal") q = q.eq("owner", meId);
      const { data, error } = await q.order("created_at");
      if (error) throw error;
      return data as Task[];
    },
    ["tasks"],
  );

  const open = sortTasks(tasks.filter((t) => !t.done));
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const title = draft.trim();
    setDraft("");
    const { error } = await supabase
      .from("tasks")
      .insert({ title, list_type: listType, owner: listType === "personal" ? meId : null, urgency, created_by: meId });
    if (error) {
      setDraft(title);
      return toast(error.message);
    }
    setUrgency("low");
    refreshAll();
  }

  async function toggle(t: Task, el: HTMLElement) {
    const nowDone = !t.done;
    if (nowDone) celebrate(el);
    await supabase
      .from("tasks")
      .update({ done: nowDone, done_at: nowDone ? new Date().toISOString() : null, done_by: nowDone ? meId : null })
      .eq("id", t.id);
    refreshAll();
  }

  async function bump(t: Task) {
    await supabase.from("tasks").update({ urgency: NEXT_URGENCY[t.urgency] }).eq("id", t.id);
    refreshAll();
  }

  async function remove(t: Task) {
    await supabase.from("tasks").delete().eq("id", t.id);
    refreshAll();
  }

  async function clearDone() {
    if (!confirm(`Clear ${done.length} finished item${done.length === 1 ? "" : "s"}?`)) return;
    await supabase.from("tasks").delete().in("id", done.map((t) => t.id));
    refreshAll();
  }

  return (
    <section>
      <div className="section-title">{title}</div>
      <p className="small muted" style={{ marginTop: -6, marginBottom: 10 }}>
        {hint}
      </p>
      <form className="quick-add" onSubmit={add}>
        <input className="input grow" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add something…" aria-label={`Add to ${title}`} />
        <button type="button" className="urg" data-u={urgency} onClick={() => setUrgency(NEXT_URGENCY[urgency])} aria-label={`Urgency: ${urgency}. Tap to change.`} style={{ minHeight: 46, paddingInline: 12 }}>
          {urgency === "low" ? "no rush" : urgency}
        </button>
        <button className="btn btn-primary" disabled={!draft.trim()}>
          Add
        </button>
      </form>

      <div className="card" style={{ marginTop: 12, padding: "4px 14px" }}>
        {open.length === 0 && (
          <div className="empty" style={{ padding: 18 }}>
            <Teapot width={52} height={52} />
            <span>All clear. Put the kettle on.</span>
          </div>
        )}
        {open.map((t) => (
          <TaskRow key={t.id} t={t} showWho={listType !== "personal"} onToggle={toggle} onBump={bump} onRemove={remove} nameOf={nameOf} />
        ))}
      </div>

      {done.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="row-between">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowDone((s) => !s)}>
              {showDone ? "▾" : "▸"} Done ({done.length})
            </button>
            {showDone && (
              <button className="btn btn-ghost btn-sm" onClick={clearDone}>
                Clear done
              </button>
            )}
          </div>
          {showDone && (
            <div className="card" style={{ padding: "4px 14px" }}>
              {done.map((t) => (
                <TaskRow key={t.id} t={t} showWho={listType !== "personal"} onToggle={toggle} onBump={bump} onRemove={remove} nameOf={nameOf} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TaskRow({
  t,
  showWho,
  onToggle,
  onBump,
  onRemove,
  nameOf,
}: {
  t: Task;
  showWho: boolean;
  onToggle: (t: Task, el: HTMLElement) => void;
  onBump: (t: Task) => void;
  onRemove: (t: Task) => void;
  nameOf: (id: string | null) => string;
}) {
  return (
    <div className={`task${t.done ? " done" : ""}`}>
      <input type="checkbox" className="check" checked={t.done} onChange={(e) => onToggle(t, e.currentTarget)} aria-label={`Done: ${t.title}`} />
      <div className="grow">
        <div className="task-title">{t.title}</div>
        {showWho && (
          <div className="small faint">
            {t.done && t.done_by ? `done by ${nameOf(t.done_by)}` : `added by ${nameOf(t.created_by)}`}
          </div>
        )}
      </div>
      {t.done ? (
        <button className="icon-btn" onClick={() => onRemove(t)} aria-label={`Delete ${t.title}`}>
          <IconTrash />
        </button>
      ) : (
        <button className="urg" data-u={t.urgency} onClick={() => onBump(t)} aria-label={`Urgency ${t.urgency}. Tap to change.`}>
          {t.urgency === "low" ? "no rush" : t.urgency === "high" ? "🔥 high" : "medium"}
        </button>
      )}
    </div>
  );
}

/* ─── Dogs ──────────────────────────────────────────────────────────────── */

const POTTY_EMOJI: Record<PottyKind, string> = { pee: "💧", poop: "💩", both: "🐾" };

function Dogs({ initialDog }: { initialDog: DogId }) {
  const [dog, setDog] = useState<DogId>(initialDog);
  const pickDog = (d: DogId) => {
    setDog(d);
    window.history.replaceState(null, "", `/lists?tab=dogs&dog=${d}`);
  };
  return (
    <>
      <div className="seg" role="group" aria-label="Which dog" style={{ marginBottom: 14 }}>
        {DOGS.map((d) => (
          <button key={d.id} aria-pressed={dog === d.id} onClick={() => pickDog(d.id)}>
            {d.name}
          </button>
        ))}
      </div>
      <DogLog key={dog} dog={dog} />
    </>
  );
}

function DogLog({ dog }: { dog: DogId }) {
  const name = dogName(dog);
  const { meId, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const [sheet, setSheet] = useState<"potty" | "note" | null>(null);
  const [, setTick] = useState(0);

  // Keep "x min ago" honest while the screen is open.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const { data: logs = [] } = useLive<KodoLog[]>(
    `dog:${dog}`,
    async () => {
      const { data, error } = await supabase.from("kodo_logs").select("*").eq("dog", dog).order("occurred_at", { ascending: false }).limit(150);
      if (error) throw error;
      return data as KodoLog[];
    },
    ["kodo_logs"],
  );

  const potties = logs.filter((l) => l.type === "potty");
  const lastAny = potties[0];
  const lastPee = potties.find((l) => l.potty_kind === "pee" || l.potty_kind === "both");
  const lastPoop = potties.find((l) => l.potty_kind === "poop" || l.potty_kind === "both");

  async function quick(kind: PottyKind, el: HTMLElement) {
    const { error } = await supabase.from("kodo_logs").insert({ dog, type: "potty", potty_kind: kind, created_by: meId });
    if (error) return toast(error.message);
    celebrate(el, ["🐾", "🦴", "🌼"]);
    refreshAll();
  }

  async function remove(l: KodoLog) {
    if (!confirm("Delete this entry?")) return;
    await supabase.from("kodo_logs").delete().eq("id", l.id);
    refreshAll();
  }

  // Group by day for the timeline.
  const groups: { label: string; items: KodoLog[] }[] = [];
  for (const l of logs) {
    const d = new Date(l.occurred_at);
    const label = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "EEEE, MMM d");
    const g = groups[groups.length - 1];
    if (g?.label === label) g.items.push(l);
    else groups.push({ label, items: [l] });
  }

  return (
    <>
      <div className="card card-stitched kodo-hero">
        <Paw width={52} height={52} style={{ color: "var(--terracotta)", flexShrink: 0 }} />
        <div className="grow">
          <div className="small muted" style={{ fontWeight: 800 }}>
            Last potty break
          </div>
          <div className="big">{lastAny ? ago(lastAny.occurred_at) : "Nothing logged yet"}</div>
          {lastAny && (
            <div className="small muted">
              💧 {lastPee ? ago(lastPee.occurred_at) : "—"} · 💩 {lastPoop ? ago(lastPoop.occurred_at) : "—"}
            </div>
          )}
        </div>
      </div>

      <div className="tiles" style={{ marginTop: 14 }}>
        <button className="tile" onClick={(e) => quick("pee", e.currentTarget)}>
          <span className="tile-emoji">💧</span>Pee
        </button>
        <button className="tile" onClick={(e) => quick("poop", e.currentTarget)}>
          <span className="tile-emoji">💩</span>Poop
        </button>
        <button className="tile" onClick={(e) => quick("both", e.currentTarget)}>
          <span className="tile-emoji">🐾</span>Both
        </button>
      </div>
      <div className="row" style={{ marginTop: 10, justifyContent: "center" }}>
        <button className="btn btn-sm" onClick={() => setSheet("potty")}>
          Log an earlier one
        </button>
        <button className="btn btn-sm btn-sage" onClick={() => setSheet("note")}>
          📝 Health / mood note
        </button>
      </div>

      <div className="section-title">
        <Paw width={20} height={20} style={{ color: "var(--rose)" }} /> Timeline
      </div>
      {logs.length === 0 ? (
        <p className="muted">{name}&apos;s story starts with the first log.</p>
      ) : (
        <div className="timeline">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="tl-day">{g.label}</div>
              {g.items.map((l) => (
                <div key={l.id} className="tl-item" data-kind={l.type}>
                  <div className="row-between" style={{ alignItems: "flex-start" }}>
                    <div className="grow">
                      <div style={{ fontWeight: 800 }}>
                        {l.type === "potty" ? `${POTTY_EMOJI[l.potty_kind!]} ${l.potty_kind === "both" ? "Pee + poop" : l.potty_kind === "pee" ? "Pee" : "Poop"}` : "📝 Note"}
                        <span className="small faint" style={{ fontWeight: 700 }}>
                          {" "}
                          · {format(new Date(l.occurred_at), "h:mm a")} · {nameOf(l.created_by)}
                        </span>
                      </div>
                      {l.detail && <p style={{ whiteSpace: "pre-wrap", marginTop: 2 }}>{l.detail}</p>}
                    </div>
                    <button className="icon-btn" onClick={() => remove(l)} aria-label="Delete entry" style={{ width: 32, height: 32 }}>
                      <IconTrash width={16} height={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {sheet === "potty" && (
        <Sheet title={`${name} went!`} onClose={() => setSheet(null)}>
          <PottyForm dog={dog} onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet === "note" && (
        <Sheet title={`${name} note`} onClose={() => setSheet(null)}>
          <DogNoteForm dog={dog} onDone={() => setSheet(null)} />
        </Sheet>
      )}
    </>
  );
}
