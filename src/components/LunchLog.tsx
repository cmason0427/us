"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useMeals } from "@/lib/foodData";
import { toDateInput } from "@/lib/dates";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

interface Lunch {
  id: string;
  day: string;
  made_by: string;
  for_user: string | null;
  what: string;
  meal_id: string | null;
  verdict: "loved" | "liked" | "meh" | "no" | null;
  verdict_note: string | null;
}

const VERDICT: Record<NonNullable<Lunch["verdict"]>, string> = { loved: "😍 Loved it", liked: "🙂 Good", meh: "😐 Meh", no: "🙅 Not again" };

/**
 * What got packed and how it went over. The maker logs it; the eater taps a
 * face whenever (no pressure to). Over time: what's a hit, what to skip.
 */
export function LunchLog() {
  const { meId, partner, nameOf } = useApp();
  const supabase = supabaseBrowser();
  const { data: log = [] } = useLive<Lunch[]>(
    "lunch_log",
    async () => {
      const { data, error } = await supabase.from("lunch_log").select("*").order("day", { ascending: false }).order("created_at", { ascending: false }).limit(120);
      if (error) throw error;
      return data as Lunch[];
    },
    ["lunch_log"],
  );
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Lunch | null>(null);

  // Hits and misses by what it was.
  const tally = new Map<string, { loved: number; no: number; n: number }>();
  for (const l of log) {
    const k = l.what.trim().toLowerCase();
    const t = tally.get(k) ?? { loved: 0, no: 0, n: 0 };
    t.n++;
    if (l.verdict === "loved") t.loved++;
    if (l.verdict === "no") t.no++;
    tally.set(k, t);
  }
  const nameFor = (k: string) => log.find((l) => l.what.trim().toLowerCase() === k)!.what;
  const hits = [...tally].filter(([, t]) => t.loved > 0).sort((a, b) => b[1].loved - a[1].loved).slice(0, 5);
  const misses = [...tally].filter(([, t]) => t.no > 0).map(([k]) => k);
  const waiting = log.filter((l) => l.for_user === meId && !l.verdict);

  return (
    <div className="stack">
      <div className="row-between">
        <p className="small muted">What got packed, and how it went over.</p>
        <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
          ＋ Log lunch
        </button>
      </div>
      {(hits.length > 0 || misses.length > 0) && (
        <div className="card small stack-sm">
          {hits.length > 0 && (
            <div>
              <strong>Hits:</strong> {hits.map(([k, t]) => `${nameFor(k)}${t.loved > 1 ? ` ×${t.loved}` : ""}`).join(", ")}
            </div>
          )}
          {misses.length > 0 && (
            <div>
              <strong>Skip:</strong> <span className="muted">{misses.map(nameFor).join(", ")}</span>
            </div>
          )}
        </div>
      )}
      {waiting.length > 0 && <p className="small">🥪 {waiting.length === 1 ? "One lunch" : `${waiting.length} lunches`} to rate, whenever.</p>}
      {log.length ? (
        <ul className="lunch-log">
          {log.map((l) => (
            <li key={l.id}>
              <button className="top" onClick={() => setOpen(l)} style={{ all: "unset", cursor: "pointer", display: "flex", gap: 8, alignItems: "baseline" }}>
                <span className="day">{format(parseISO(l.day), "EEE M/d")}</span>
                <span className="grow">
                  <strong>{l.what}</strong>
                  <span className="small faint">
                    {" "}
                    · {l.made_by === meId ? "you" : nameOf(l.made_by)} → {l.for_user === meId ? "you" : l.for_user ? nameOf(l.for_user) : "both"}
                  </span>
                </span>
              </button>
              {l.for_user === meId ? (
                <div className="chips">
                  {(Object.keys(VERDICT) as NonNullable<Lunch["verdict"]>[]).map((v) => (
                    <button
                      key={v}
                      className="chip chip-sm"
                      aria-pressed={l.verdict === v}
                      onClick={async () => {
                        await supabase.from("lunch_log").update({ verdict: l.verdict === v ? null : v }).eq("id", l.id);
                        refreshAll();
                      }}
                    >
                      {VERDICT[v]}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="small muted">{l.verdict ? VERDICT[l.verdict] : "not rated yet"}</span>
              )}
              {l.verdict_note && <span className="small">“{l.verdict_note}”</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Nothing logged yet. Pack something, log it, and {partner?.display_name ?? "they"} can tap how it was.</p>
      )}

      {adding && (
        <Sheet title="🥪 Log a lunch" onClose={() => setAdding(false)}>
          <LunchForm onDone={() => setAdding(false)} />
        </Sheet>
      )}
      {open && (
        <Sheet title={open.what} onClose={() => setOpen(null)}>
          <LunchForm initial={open} onDone={() => setOpen(null)} />
        </Sheet>
      )}
    </div>
  );
}

function LunchForm({ initial, onDone }: { initial?: Lunch; onDone: () => void }) {
  const { meId, partner, toast } = useApp();
  const meals = useMeals();
  const [day, setDay] = useState(initial?.day ?? toDateInput(new Date()));
  const [what, setWhat] = useState(initial?.what ?? "");
  const [forUser, setForUser] = useState<string | null>(initial ? initial.for_user : (partner?.id ?? null));
  const [note, setNote] = useState(initial?.verdict_note ?? "");
  const supabase = supabaseBrowser();
  const eater = initial?.for_user === meId;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!what.trim()) return;
    const meal = meals.find((m) => m.name.toLowerCase() === what.trim().toLowerCase());
    const row = { day, what: what.trim(), for_user: forUser, meal_id: meal?.id ?? null, verdict_note: note.trim() || null };
    const { error } = initial ? await supabase.from("lunch_log").update(row).eq("id", initial.id) : await supabase.from("lunch_log").insert({ ...row, made_by: meId });
    if (error) return toast(error.message);
    refreshAll();
    onDone();
  }

  return (
    <form className="stack" onSubmit={save}>
      <input className="input" list="lunch-meals" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Turkey wrap + grapes" autoFocus={!initial} required aria-label="What" />
      <datalist id="lunch-meals">
        {meals.map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>
      <div className="grid-2">
        <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day" />
        <div className="seg" role="group" aria-label="For">
          {partner && (
            <button type="button" aria-pressed={forUser === partner.id} onClick={() => setForUser(partner.id)}>
              {partner.display_name}
            </button>
          )}
          <button type="button" aria-pressed={forUser === meId} onClick={() => setForUser(meId)}>
            Me
          </button>
          <button type="button" aria-pressed={forUser === null} onClick={() => setForUser(null)}>
            Both
          </button>
        </div>
      </div>
      {(eater || initial) && <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={eater ? "How was it? (optional)" : "Their note"} aria-label="Note" />}
      <div className="row-between">
        {initial ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              if (!confirm("Delete this lunch?")) return;
              await supabase.from("lunch_log").delete().eq("id", initial.id);
              refreshAll();
              onDone();
            }}
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <button className="btn btn-primary" disabled={!what.trim()}>
          {initial ? "Save" : "Log it"}
        </button>
      </div>
    </form>
  );
}
