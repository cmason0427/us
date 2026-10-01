"use client";

import { useState } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useNow } from "@/lib/dates";
import { dogName } from "@/lib/dogs";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

// Training sessions as report cards. Built for treating your own dog like a
// client: log what motivated him, what went well, what he struggled with, what's
// next, about what share of reps went right, whether you'd be proud of a client
// dog for it, and who the session was really for. Every field is optional, and
// the report card only shows what was filled in.

export interface Session {
  id: string;
  dog: string;
  logged_by: string;
  day: string;
  minutes: number | null;
  place: string | null;
  kinds: string[];
  emojis: string[];
  tags: string[];
  motivators: string[];
  motivator_note: string | null;
  succeeded: string | null;
  struggled: string | null;
  next_time: string | null;
  success_pct: number | null;
  focus: number | null;
  client_proud: "yes" | "mostly" | "not_yet" | null;
  for_whom: "him" | "me" | "both" | null;
  for_whom_note: string | null;
  milestone: string | null;
  notes: string | null;
  created_at: string;
}

const EMOJIS = ["🤩", "😊", "🙂", "😐", "😵‍💫", "😤", "🧠", "🎯", "🔥", "💪", "💤", "🐿️", "🥵", "🌧️", "❤️", "🏆"];
const KINDS = ["new skill", "practice", "free shaping", "proofing", "impulse control", "recall", "leash", "place / settle", "tricks", "socialization", "decompression"];
const MOTIVATORS = ["food", "high-value food", "tug", "ball", "sniffing", "chase", "praise", "play with me", "freedom / release", "the work itself"];
const PROUD: Record<NonNullable<Session["client_proud"]>, string> = { yes: "Yes", mostly: "Mostly", not_yet: "Not yet" };
const WHOM: Record<NonNullable<Session["for_whom"]>, string> = { him: "For him", me: "For me", both: "Both" };
const FOCUS = ["", "Scattered", "In & out", "Okay", "Locked in", "Laser"];

function useSessions(dog: string) {
  const { data = [] } = useLive<Session[]>(
    `training_sessions:${dog}`,
    async () => {
      const { data, error } = await supabaseBrowser().from("training_sessions").select("*").eq("dog", dog).order("day", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Session[];
    },
    ["training_sessions"],
  );
  return data;
}

export function TrainingLog({ dog }: { dog: string }) {
  const now = useNow();
  const sessions = useSessions(dog);
  const [logging, setLogging] = useState<Session | "new" | null>(null);
  const [viewing, setViewing] = useState<Session | null>(null);
  if (!now) return null;
  const last = sessions[0];
  const lastNext = sessions.find((s) => s.next_time);
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const thisWeek = sessions.filter((s) => s.day >= weekStart).length;
  const recentPct = sessions.filter((s) => s.success_pct != null).slice(0, 10);
  const avgPct = recentPct.length ? Math.round(recentPct.reduce((a, s) => a + s.success_pct!, 0) / recentPct.length) : null;
  const days = new Set(sessions.map((s) => s.day));
  let streak = 0;
  for (let d = days.has(format(now, "yyyy-MM-dd")) ? now : addDays(now, -1); days.has(format(d, "yyyy-MM-dd")); d = addDays(d, -1)) streak++;
  const milestones = sessions.filter((s) => s.milestone);

  // Report cards grouped by month.
  const months = new Map<string, Session[]>();
  for (const s of sessions) {
    const k = s.day.slice(0, 7);
    months.set(k, [...(months.get(k) ?? []), s]);
  }

  return (
    <div className="stack">
      <section className="card fit-card">
        <button className="btn btn-primary btn-block" onClick={() => setLogging("new")}>
          ＋ Log a session
        </button>
        {lastNext && (
          <div className="tl-next">
            <span className="small faint">Last time you planned to work on</span>
            <span>{lastNext.next_time}</span>
          </div>
        )}
        {sessions.length > 0 && (
          <div className="water-stats">
            <div>
              <strong>{thisWeek}</strong>
              <span className="small faint">sessions this week</span>
            </div>
            <div>
              <strong>{avgPct != null ? `${avgPct}%` : "–"}</strong>
              <span className="small faint">reps went right (last 10)</span>
            </div>
            <div>
              <strong>{streak || "–"}</strong>
              <span className="small faint">days in a row</span>
            </div>
          </div>
        )}
        {last && (
          <span className="small faint">
            Last session {last.day === format(now, "yyyy-MM-dd") ? "today" : format(parseISO(last.day), "EEE MMM d")}
            {last.emojis.length ? ` ${last.emojis.join("")}` : ""}
          </span>
        )}
      </section>

      {sessions.length === 0 ? (
        <p className="small muted" style={{ margin: "0 4px" }}>
          No sessions yet. Log one after a hike or a house session, even just a couple of emojis. Fill in more when you&apos;ve got more to say.
        </p>
      ) : (
        <>
          <Progress sessions={sessions} onPick={setViewing} />
          {milestones.length > 0 && (
            <section className="card fit-card">
              <strong>⭐ Milestones</strong>
              <ul className="tl-milestones">
                {milestones.map((s) => (
                  <li key={s.id}>
                    <button className="btn-link" onClick={() => setViewing(s)}>
                      {s.milestone}
                    </button>
                    <span className="small faint">{format(parseISO(s.day), "MMM d, yyyy")}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {[...months.entries()].map(([m, list]) => (
            <section key={m} className="stack-sm">
              <div className="section-title tl-month">{format(parseISO(`${m}-01`), "MMMM yyyy")}</div>
              <div className="tl-grid">
                {list.map((s) => (
                  <button key={s.id} className={`tl-tile${s.milestone ? " star" : ""}`} onClick={() => setViewing(s)}>
                    <span className="tl-date">
                      <strong>{format(parseISO(s.day), "d")}</strong>
                      <span>{format(parseISO(s.day), "EEE")}</span>
                    </span>
                    <span className="tl-emojis">{s.emojis.length ? s.emojis.join("") : "📋"}</span>
                    {(s.tags[0] || s.kinds[0]) && <span className="tl-tag">{s.tags[0] ?? s.kinds[0]}</span>}
                    {s.milestone && <span className="tl-star" aria-label="milestone">⭐</span>}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {logging && <SessionSheet dog={dog} session={logging === "new" ? null : logging} lastNext={lastNext?.next_time ?? null} sessions={sessions} onClose={() => setLogging(null)} />}
      {viewing && (
        <ReportCard
          s={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setLogging(viewing);
            setViewing(null);
          }}
        />
      )}
    </div>
  );
}

/* ─── progress chart ─────────────────────────────────────────────────────── */

function Progress({ sessions, onPick }: { sessions: Session[]; onPick: (s: Session) => void }) {
  const [range, setRange] = useState<30 | 90 | 365>(90);
  const now = useNow()!;
  const since = format(addDays(now, -range + 1), "yyyy-MM-dd");
  const pts = sessions
    .filter((s) => s.day >= since && s.success_pct != null)
    .slice()
    .reverse();
  const inRange = sessions.filter((s) => s.day >= since);
  const whom = { him: 0, me: 0, both: 0 };
  for (const s of inRange) if (s.for_whom) whom[s.for_whom]++;
  const proud = inRange.filter((s) => s.client_proud === "yes" || s.client_proud === "mostly").length;
  const proudOf = inRange.filter((s) => s.client_proud).length;
  const stars = inRange.filter((s) => s.milestone);

  const W = 320;
  const H = 110;
  const t0 = parseISO(since).getTime();
  const span = now.getTime() - t0 || 1;
  const x = (day: string) => 6 + ((parseISO(day).getTime() - t0) / span) * (W - 12);
  const y = (p: number) => H - 4 - (p / 100) * (H - 12);
  // Running average of the last 5 sessions, so one rough day doesn't read as a trend.
  const avg = pts.map((_, k) => {
    const w = pts.slice(Math.max(0, k - 4), k + 1);
    return w.reduce((a, s) => a + s.success_pct!, 0) / w.length;
  });

  return (
    <section className="card fit-card">
      <div className="row-between">
        <strong>Progress</strong>
        <div className="seg seg-sm" role="group" aria-label="Range">
          {([30, 90, 365] as const).map((r) => (
            <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>
              {r === 365 ? "1y" : `${r}d`}
            </button>
          ))}
        </div>
      </div>
      {pts.length ? (
        <>
          <div className="small faint tl-legend">
            <span>
              <i className="tl-key-dot" /> each session&apos;s % of reps that went right
            </span>
            <span>
              <i className="tl-key-line" /> running average
            </span>
            {stars.length > 0 && <span>⭐ milestone</span>}
          </div>
          <svg viewBox={`0 0 ${W} ${H + 14}`} className="water-svg" role="img" aria-label="Share of reps that went right, per session">
            {[25, 50, 75, 100].map((g) => (
              <g key={g}>
                <line x1={0} x2={W} y1={y(g)} y2={y(g)} className="tl-grid-line" />
                <text x={0} y={y(g) - 2} className="tl-axis">
                  {g}%
                </text>
              </g>
            ))}
            {avg.length > 1 && <polyline points={pts.map((s, k) => `${x(s.day)},${y(avg[k])}`).join(" ")} className="tl-avg" />}
            {pts.map((s) => (
              <circle key={s.id} cx={x(s.day)} cy={y(s.success_pct!)} r={4.5} className="tl-dot" onClick={() => onPick(s)} style={{ cursor: "pointer" }}>
                <title>
                  {format(parseISO(s.day), "MMM d")}: {s.success_pct}%
                </title>
              </circle>
            ))}
            {stars.map((s) => (
              <text key={s.id} x={x(s.day)} y={H + 12} textAnchor="middle" fontSize="11" onClick={() => onPick(s)} style={{ cursor: "pointer" }}>
                ⭐
              </text>
            ))}
          </svg>
        </>
      ) : (
        <span className="small faint">Add &ldquo;about what % of reps went right&rdquo; to sessions and the line shows up here.</span>
      )}
      <div className="water-stats">
        <div>
          <strong>{inRange.length}</strong>
          <span className="small faint">sessions</span>
        </div>
        <div>
          <strong>{proudOf ? `${proud}/${proudOf}` : "–"}</strong>
          <span className="small faint">you&apos;d be proud of as a client</span>
        </div>
        <div>
          <strong className="tl-whom">{whom.him + whom.me + whom.both ? `${whom.him}·${whom.both}·${whom.me}` : "–"}</strong>
          <span className="small faint">for him · both · for me</span>
        </div>
      </div>
    </section>
  );
}

/* ─── report card (only what was filled in) ─────────────────────────────── */

function ReportCard({ s, onClose, onEdit }: { s: Session; onClose: () => void; onEdit: () => void }) {
  const { meId, nameOf } = useApp();
  const line = (label: string, value: React.ReactNode) => (
    <div className="tl-line">
      <span className="small faint">{label}</span>
      <div>{value}</div>
    </div>
  );
  const meta = [s.minutes ? `${s.minutes} min` : null, s.place].filter(Boolean).join(" · ");
  return (
    <Sheet title={`${dogName(s.dog)} · ${format(parseISO(s.day), "EEE, MMM d")}`} onClose={onClose}>
      <div className="stack tl-card">
        {(s.emojis.length > 0 || meta) && (
          <div className="row" style={{ gap: 10 }}>
            {s.emojis.length > 0 && <span className="tl-card-emojis">{s.emojis.join(" ")}</span>}
            {meta && <span className="muted">{meta}</span>}
          </div>
        )}
        {s.milestone && <div className="tl-milestone-banner">⭐ {s.milestone}</div>}
        {(s.kinds.length > 0 || s.tags.length > 0) && (
          <div className="chips">
            {s.kinds.map((k) => (
              <span key={k} className="chip chip-sm">
                {k}
              </span>
            ))}
            {s.tags.map((t) => (
              <span key={t} className="chip chip-sm tl-tagchip">
                #{t}
              </span>
            ))}
          </div>
        )}
        {(s.success_pct != null || s.focus || s.client_proud) && (
          <div className="water-stats">
            {s.success_pct != null && (
              <div>
                <strong>{s.success_pct}%</strong>
                <span className="small faint">reps went right</span>
              </div>
            )}
            {s.focus && (
              <div>
                <strong>{s.focus}/5</strong>
                <span className="small faint">focus · {FOCUS[s.focus]}</span>
              </div>
            )}
            {s.client_proud && (
              <div>
                <strong>{PROUD[s.client_proud]}</strong>
                <span className="small faint">proud of a client for this?</span>
              </div>
            )}
          </div>
        )}
        {(s.motivators.length > 0 || s.motivator_note) && line("Most motivating", [s.motivators.join(", "), s.motivator_note].filter(Boolean).join(" · "))}
        {s.succeeded && line("💪 Best at", s.succeeded)}
        {s.struggled && line("🧗 Struggled with", s.struggled)}
        {s.next_time && line("➡️ Next time", s.next_time)}
        {(s.for_whom || s.for_whom_note) &&
          line(
            "Who was it for",
            <>
              {s.for_whom && <strong>{WHOM[s.for_whom]}</strong>}
              {s.for_whom_note && <p className="tl-pre">{s.for_whom_note}</p>}
            </>,
          )}
        {s.notes && line("Notes", <p className="tl-pre">{s.notes}</p>)}
        <div className="row-between">
          <span className="small faint">logged by {s.logged_by === meId ? "you" : nameOf(s.logged_by)}</span>
          <button className="btn btn-sm" onClick={onEdit}>
            Edit
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/* ─── log / edit a session ───────────────────────────────────────────────── */

function toggle<T>(list: T[], v: T, max = 99) {
  return list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v];
}

function SessionSheet({ dog, session, lastNext, sessions, onClose }: { dog: string; session: Session | null; lastNext: string | null; sessions: Session[]; onClose: () => void }) {
  const { toast } = useApp();
  const now = useNow();
  const s = session;
  const [day, setDay] = useState(s?.day ?? (now ? format(now, "yyyy-MM-dd") : ""));
  const [minutes, setMinutes] = useState(s?.minutes ? String(s.minutes) : "");
  const [place, setPlace] = useState(s?.place ?? "");
  const [kinds, setKinds] = useState<string[]>(s?.kinds ?? []);
  const [emojis, setEmojis] = useState<string[]>(s?.emojis ?? []);
  const [tags, setTags] = useState<string[]>(s?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [motivators, setMotivators] = useState<string[]>(s?.motivators ?? []);
  const [motivatorNote, setMotivatorNote] = useState(s?.motivator_note ?? "");
  const [succeeded, setSucceeded] = useState(s?.succeeded ?? "");
  const [struggled, setStruggled] = useState(s?.struggled ?? "");
  const [nextTime, setNextTime] = useState(s?.next_time ?? "");
  const [pct, setPct] = useState<number | null>(s?.success_pct ?? null);
  const [focus, setFocus] = useState<number | null>(s?.focus ?? null);
  const [proud, setProud] = useState<Session["client_proud"]>(s?.client_proud ?? null);
  const [whom, setWhom] = useState<Session["for_whom"]>(s?.for_whom ?? null);
  const [whomNote, setWhomNote] = useState(s?.for_whom_note ?? "");
  const [milestone, setMilestone] = useState(s?.milestone ?? "");
  const [isMilestone, setIsMilestone] = useState(!!s?.milestone);
  const [notes, setNotes] = useState(s?.notes ?? "");
  const db = supabaseBrowser();

  const recentPlaces = [...new Set(sessions.map((x) => x.place).filter(Boolean) as string[])].slice(0, 6);
  const recentTags = [...new Set(sessions.flatMap((x) => x.tags))].filter((t) => !tags.includes(t)).slice(0, 8);
  const addTag = () => {
    const t = tagDraft.trim().replace(/^#/, "").toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagDraft("");
  };

  async function save() {
    if (!day) return;
    const t = (v: string) => v.trim() || null;
    const row = {
      dog,
      day,
      minutes: Number(minutes) > 0 ? Math.round(Number(minutes)) : null,
      place: t(place),
      kinds,
      emojis,
      tags: tagDraft.trim() ? [...tags, tagDraft.trim().replace(/^#/, "").toLowerCase()] : tags,
      motivators,
      motivator_note: t(motivatorNote),
      succeeded: t(succeeded),
      struggled: t(struggled),
      next_time: t(nextTime),
      success_pct: pct,
      focus,
      client_proud: proud,
      for_whom: whom,
      for_whom_note: t(whomNote),
      milestone: isMilestone ? t(milestone) : null,
      notes: t(notes),
    };
    const { error } = s ? await db.from("training_sessions").update(row).eq("id", s.id) : await db.from("training_sessions").insert(row);
    if (error) return toast(error.message);
    refreshAll();
    toast(isMilestone && milestone.trim() ? "⭐ Milestone logged" : "Session logged 🐾");
    onClose();
  }

  return (
    <Sheet title={s ? "Edit session" : `${dogName(dog)} · new session`} onClose={onClose}>
      <div className="stack tl-form">
        {!s && lastNext && (
          <div className="tl-next">
            <span className="small faint">Last time you said: work on</span>
            <span>{lastNext}</span>
          </div>
        )}
        <div className="row wrap" style={{ gap: 8 }}>
          <input className="input input-sm" type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day" />
          <input className="input input-sm" style={{ width: 90 }} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, ""))} placeholder="minutes" aria-label="Minutes" />
          <input className="input input-sm grow" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="where (hike, house…)" aria-label="Where" />
        </div>
        {recentPlaces.length > 0 && (
          <div className="chips">
            {recentPlaces.map((p) => (
              <button key={p} className="chip chip-sm" aria-pressed={place === p} onClick={() => setPlace(p)}>
                {p}
              </button>
            ))}
          </div>
        )}

        <Field label="How it went (pick up to 3)">
          <div className="tl-emoji-pick">
            {EMOJIS.map((e) => (
              <button key={e} aria-pressed={emojis.includes(e)} onClick={() => setEmojis(toggle(emojis, e, 3))} aria-label={e}>
                {e}
              </button>
            ))}
          </div>
        </Field>

        <Field label="What kind of session">
          <div className="chips">
            {KINDS.map((k) => (
              <button key={k} className="chip chip-sm" aria-pressed={kinds.includes(k)} onClick={() => setKinds(toggle(kinds, k))}>
                {k}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Tags">
          <div className="row wrap" style={{ gap: 6 }}>
            {tags.map((t) => (
              <button key={t} className="chip chip-sm tl-tagchip" aria-pressed onClick={() => setTags(tags.filter((x) => x !== t))}>
                #{t} ✕
              </button>
            ))}
            <input
              className="input input-sm grow"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
              placeholder="add a tag"
              aria-label="Add a tag"
            />
          </div>
          {recentTags.length > 0 && (
            <div className="chips" style={{ marginTop: 6 }}>
              {recentTags.map((t) => (
                <button key={t} className="chip chip-sm" onClick={() => setTags([...tags, t])}>
                  #{t}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Most motivating">
          <div className="chips">
            {MOTIVATORS.map((m) => (
              <button key={m} className="chip chip-sm" aria-pressed={motivators.includes(m)} onClick={() => setMotivators(toggle(motivators, m))}>
                {m}
              </button>
            ))}
          </div>
          <input className="input input-sm" value={motivatorNote} onChange={(e) => setMotivatorNote(e.target.value)} placeholder="specifics (e.g. freeze-dried liver beat cheese)" style={{ marginTop: 6 }} />
        </Field>

        <label className="field">
          <span>💪 Best at</span>
          <textarea className="textarea" rows={2} value={succeeded} onChange={(e) => setSucceeded(e.target.value)} />
        </label>
        <label className="field">
          <span>🧗 Struggled with</span>
          <textarea className="textarea" rows={2} value={struggled} onChange={(e) => setStruggled(e.target.value)} />
        </label>
        <label className="field">
          <span>➡️ Most worth working on next time</span>
          <textarea className="textarea" rows={2} value={nextTime} onChange={(e) => setNextTime(e.target.value)} />
        </label>

        <div className="tl-lens">
          <strong className="small">Client lens</strong>
          <div className="field">
            <span>About what % of reps went right? {pct != null ? <strong>{pct}%</strong> : <span className="faint">(skip if you didn&apos;t count)</span>}</span>
            <input type="range" min={0} max={100} step={5} value={pct ?? 80} onChange={(e) => setPct(Number(e.target.value))} aria-label="Percent of reps that went right" />
            {pct != null && (
              <button className="btn-link small faint" onClick={() => setPct(null)}>
                clear
              </button>
            )}
          </div>
          <div className="field">
            <span>Would you be proud of a client dog for this session?</span>
            <div className="seg seg-sm" role="group" aria-label="Proud as a client">
              {(Object.keys(PROUD) as (keyof typeof PROUD)[]).map((k) => (
                <button key={k} aria-pressed={proud === k} onClick={() => setProud(proud === k ? null : k)}>
                  {PROUD[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>His focus</span>
            <div className="seg seg-sm" role="group" aria-label="Focus">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} aria-pressed={focus === n} onClick={() => setFocus(focus === n ? null : n)} title={FOCUS[n]}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Field label="Who was this session for?">
          <div className="seg seg-sm" role="group" aria-label="Who was it for">
            {(Object.keys(WHOM) as (keyof typeof WHOM)[]).map((k) => (
              <button key={k} aria-pressed={whom === k} onClick={() => setWhom(whom === k ? null : k)}>
                {WHOM[k]}
              </button>
            ))}
          </div>
          <textarea className="textarea" rows={3} value={whomNote} onChange={(e) => setWhomNote(e.target.value)} placeholder="be honest: what you needed from it, what he needed" style={{ marginTop: 6 }} />
        </Field>

        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={isMilestone} onChange={(e) => setIsMilestone(e.target.checked)} />
          <span>⭐ This was a milestone</span>
        </label>
        {isMilestone && <input className="input" value={milestone} onChange={(e) => setMilestone(e.target.value)} placeholder="e.g. first off-leash recall past deer" aria-label="Milestone" />}

        <label className="field">
          <span>Notes</span>
          <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        <button className="btn btn-primary btn-block" onClick={save}>
          Save
        </button>
        {s && (
          <button
            className="btn-link small faint"
            onClick={async () => {
              const { error } = await db.from("training_sessions").delete().eq("id", s.id);
              if (error) return toast(error.message);
              refreshAll();
              onClose();
            }}
          >
            delete session
          </button>
        )}
      </div>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <span>{label}</span>
      {children}
    </div>
  );
}
