"use client";

import { useState } from "react";
import Link from "next/link";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useNow } from "@/lib/dates";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

// Water: a daily goal per person, one-tap logs, an optional row on Home and a
// trends view. Stored in ml; shown in each person's unit (oz or ml).

export interface WaterSettings {
  user_id: string;
  goal_ml: number;
  unit: "oz" | "ml";
  sizes_ml: number[];
  on_home: boolean;
}
interface WaterLog {
  id: string;
  user_id: string;
  logged_by: string;
  day: string;
  ml: number;
  created_at: string;
}

const OZ = 29.5735;
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const DEFAULTS = (user_id: string): WaterSettings => ({ user_id, goal_ml: 1893, unit: "oz", sizes_ml: [237, 355, 473, 710], on_home: true });
export const fmtWater = (ml: number, unit: "oz" | "ml") => (unit === "oz" ? `${Math.round(ml / OZ)} oz` : ml >= 1000 ? `${(ml / 1000).toFixed(1)} L` : `${Math.round(ml)} ml`);
const toMl = (n: number, unit: "oz" | "ml") => Math.round(unit === "oz" ? n * OZ : n);
const fromMl = (ml: number, unit: "oz" | "ml") => (unit === "oz" ? Math.round(ml / OZ) : Math.round(ml));

export function useWaterSettings(userId: string | undefined) {
  const { data = [] } = useLive<WaterSettings[]>(
    "water_settings",
    async () => {
      const { data, error } = await supabaseBrowser().from("water_settings").select("*");
      if (error) throw error;
      return data as WaterSettings[];
    },
    ["water_settings"],
  );
  return data.find((s) => s.user_id === userId) ?? DEFAULTS(userId ?? "");
}

export function useWaterLogs(userId: string | undefined, days = 120) {
  const since = iso(addDays(new Date(), -days));
  const { data = [] } = useLive<WaterLog[]>(
    `water_logs:${userId}:${days}`,
    async () => {
      if (!userId) return [];
      const { data, error } = await supabaseBrowser().from("water_logs").select("*").eq("user_id", userId).gte("day", since).order("created_at");
      if (error) throw error;
      return data as WaterLog[];
    },
    ["water_logs"],
  );
  return data;
}

async function addWater(userId: string, meId: string, ml: number, day?: string) {
  const { error } = await supabaseBrowser()
    .from("water_logs")
    .insert({ user_id: userId, logged_by: meId, ml, ...(day ? { day } : {}) });
  if (!error) refreshAll();
  return error?.message ?? null;
}

/** A filling glass: how far through today's goal. */
function Glass({ pct, size = 64 }: { pct: number; size?: number }) {
  const p = Math.max(0, Math.min(1, pct));
  const top = 10 + (1 - p) * 76;
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 80 92" aria-hidden className="water-glass">
      <defs>
        <clipPath id="glass-clip">
          <path d="M14 8 L66 8 L60 86 Q60 88 58 88 L22 88 Q20 88 20 86 Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#glass-clip)">
        <rect x="0" y={top} width="80" height="92" className="water-fill" />
        <path d={`M0 ${top} Q 20 ${top - 4} 40 ${top} T 80 ${top} V ${top + 6} H 0 Z`} className="water-wave" />
      </g>
      <path d="M14 8 L66 8 L60 86 Q60 88 58 88 L22 88 Q20 88 20 86 Z" className="water-outline" />
    </svg>
  );
}

/** Quick add: the person's preset sizes, plus a custom amount. */
export function WaterQuickAdd({ userId, onDone }: { userId: string; onDone?: () => void }) {
  const { meId, toast } = useApp();
  const s = useWaterSettings(userId);
  const [custom, setCustom] = useState("");
  const add = async (ml: number) => {
    const err = await addWater(userId, meId, ml);
    if (err) return toast(err);
    toast(`💧 +${fmtWater(ml, s.unit)}`);
    onDone?.();
  };
  return (
    <div className="stack-sm">
      <div className="water-sizes">
        {s.sizes_ml.map((ml) => (
          <button key={ml} className="water-size" onClick={() => add(ml)}>
            +{fmtWater(ml, s.unit)}
          </button>
        ))}
      </div>
      <form
        className="quick-add"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(custom);
          if (n > 0) add(toMl(n, s.unit));
          setCustom("");
        }}
      >
        <input className="input input-sm grow" inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))} placeholder={`other amount (${s.unit})`} aria-label="Other amount" />
        <button className="btn btn-sm" disabled={!custom}>
          Add
        </button>
      </form>
    </div>
  );
}

/** The Home row (each person can turn it off in water settings). */
export function useWaterHome() {
  const { meId } = useApp();
  const now = useNow();
  const s = useWaterSettings(meId);
  const logs = useWaterLogs(meId, 1);
  const today = now ? iso(now) : "";
  const total = logs.filter((l) => l.day === today).reduce((a, l) => a + l.ml, 0);
  return { show: s.on_home && !!now, total, settings: s };
}

export function WaterHomeLine({ total, s }: { total: number; s: WaterSettings }) {
  const pct = total / s.goal_ml;
  return (
    <>
      {fmtWater(total, s.unit)} of {fmtWater(s.goal_ml, s.unit)}
      <span className="small faint"> · {pct >= 1 ? "goal met 🎉" : `${Math.round(pct * 100)}%`}</span>
    </>
  );
}

export function WaterHomeSheet({ onClose }: { onClose: () => void }) {
  const { meId } = useApp();
  const { total, settings } = useWaterHome();
  return (
    <Sheet title="💧 Water today" onClose={onClose}>
      <div className="stack">
        <div className="row" style={{ gap: 14 }}>
          <Glass pct={total / settings.goal_ml} size={56} />
          <div>
            <strong className="water-big">{fmtWater(total, settings.unit)}</strong>
            <div className="small muted">of {fmtWater(settings.goal_ml, settings.unit)}</div>
          </div>
        </div>
        <WaterQuickAdd userId={meId} />
        <Link href="/water" className="btn btn-sm btn-ghost">
          Trends &amp; goals ›
        </Link>
      </div>
    </Sheet>
  );
}

/* ─── the page ───────────────────────────────────────────────────────────── */

const RANGES = [7, 30, 90] as const;

export function WaterView() {
  const { meId, partner, nameOf, toast } = useApp();
  const now = useNow();
  const [who, setWho] = useState<string | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]>(7);
  const [settings, setSettings] = useState(false);
  const person = who ?? meId;
  const s = useWaterSettings(person);
  const logs = useWaterLogs(person, 120);
  if (!now) return null;
  const today = iso(now);
  const todays = logs.filter((l) => l.day === today);
  const total = todays.reduce((a, l) => a + l.ml, 0);
  const mine = person === meId;

  // Per-day totals for the chart and stats.
  const byDay = new Map<string, number>();
  for (const l of logs) byDay.set(l.day, (byDay.get(l.day) ?? 0) + l.ml);
  const days = Array.from({ length: range }, (_, k) => iso(addDays(now, k - range + 1)));
  const firstLog = logs[0]?.day;
  // Only count days since they started logging, so a new tracker isn't a wall of misses.
  const counted = days.filter((d) => firstLog && d >= firstLog && d < today);
  const met = counted.filter((d) => (byDay.get(d) ?? 0) >= s.goal_ml).length;
  const avg = counted.length ? counted.reduce((a, d) => a + (byDay.get(d) ?? 0), 0) / counted.length : 0;
  let streak = 0;
  for (let d = (byDay.get(today) ?? 0) >= s.goal_ml ? now : addDays(now, -1); (byDay.get(iso(d)) ?? 0) >= s.goal_ml; d = addDays(d, -1)) streak++;

  return (
    <div className="stack">
      <div className="row-between">
        <div className="seg seg-sm" role="group" aria-label="Whose">
          <button aria-pressed={person === meId} onClick={() => setWho(meId)}>
            Me
          </button>
          {partner && (
            <button aria-pressed={person === partner.id} onClick={() => setWho(partner.id)}>
              {partner.display_name}
            </button>
          )}
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => setSettings(true)}>
          ⚙︎ {mine ? "My goal" : `${nameOf(person)}'s goal`}
        </button>
      </div>

      <section className="card water-today">
        <Glass pct={total / s.goal_ml} size={84} />
        <div className="grow stack-sm">
          <div>
            <strong className="water-big">{fmtWater(total, s.unit)}</strong>
            <span className="muted"> / {fmtWater(s.goal_ml, s.unit)} today</span>
          </div>
          <span className="small faint">
            {total >= s.goal_ml ? "Goal met. Nice. 💧" : `${fmtWater(s.goal_ml - total, s.unit)} to go`}
            {streak > 1 ? ` · 🔥 ${streak} days in a row` : ""}
          </span>
        </div>
      </section>

      <section className="card fit-card">
        <strong>Add water{mine ? "" : ` for ${nameOf(person)}`}</strong>
        <WaterQuickAdd userId={person} />
        {todays.length > 0 && (
          <ul className="fit-list">
            {todays
              .slice()
              .reverse()
              .map((l) => (
                <li key={l.id}>
                  <span className="grow">
                    💧 {fmtWater(l.ml, s.unit)}
                    {l.logged_by !== person && <span className="small faint"> · by {l.logged_by === meId ? "you" : nameOf(l.logged_by)}</span>}
                  </span>
                  <span className="small faint">{format(parseISO(l.created_at), "h:mm a")}</span>
                  <button
                    className="btn-link small faint"
                    aria-label="Remove"
                    onClick={async () => {
                      const { error } = await supabaseBrowser().from("water_logs").delete().eq("id", l.id);
                      if (error) return toast(error.message);
                      refreshAll();
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="card fit-card">
        <div className="row-between">
          <strong>Trends</strong>
          <div className="seg seg-sm" role="group" aria-label="Range">
            {RANGES.map((r) => (
              <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>
                {r}d
              </button>
            ))}
          </div>
        </div>
        <WaterChart days={days} byDay={byDay} goal={s.goal_ml} unit={s.unit} today={today} />
        <div className="water-stats">
          <div>
            <strong>{counted.length ? `${met}/${counted.length}` : "–"}</strong>
            <span className="small faint">days goal met</span>
          </div>
          <div>
            <strong>{counted.length ? `${Math.round((met / counted.length) * 100)}%` : "–"}</strong>
            <span className="small faint">hit rate</span>
          </div>
          <div>
            <strong>{counted.length ? fmtWater(avg, s.unit) : "–"}</strong>
            <span className="small faint">average a day</span>
          </div>
        </div>
        {!counted.length && <span className="small faint">Trends fill in after the first full day of logging (today counts once it&apos;s over).</span>}
      </section>

      {settings && <WaterSettingsSheet s={s} onClose={() => setSettings(false)} />}
    </div>
  );
}

/** Daily totals as bars against a dashed goal line. Tap a bar to read it. */
function WaterChart({ days, byDay, goal, unit, today }: { days: string[]; byDay: Map<string, number>; goal: number; unit: "oz" | "ml"; today: string }) {
  const [sel, setSel] = useState<string | null>(null);
  const W = 320;
  const H = 120;
  const top = Math.max(goal * 1.25, ...days.map((d) => byDay.get(d) ?? 0));
  const n = days.length;
  const slot = W / n;
  const bw = Math.max(2, Math.min(26, slot - 2));
  const y = (ml: number) => H - (ml / top) * H;
  const picked = sel ?? today;
  const pv = byDay.get(picked) ?? 0;
  return (
    <div className="water-chart">
      <div className="small water-readout">
        <strong>{format(parseISO(picked), picked === today ? "'Today'" : "EEE, MMM d")}</strong> · {fmtWater(pv, unit)}
        <span className="faint"> {pv >= goal ? "· goal met" : `· ${Math.round((pv / goal) * 100)}% of goal`}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="water-svg" role="img" aria-label={`Water per day for the last ${n} days`}>
        {days.map((d, k) => {
          const v = byDay.get(d) ?? 0;
          const h = Math.max(v ? 2 : 0, H - y(v));
          const x = k * slot + (slot - bw) / 2;
          return (
            <g key={d} onClick={() => setSel(d)} style={{ cursor: "pointer" }}>
              <rect x={k * slot} y={0} width={slot} height={H} fill="transparent" />
              {h > 0 && <rect x={x} y={H - h} width={bw} height={h} rx={Math.min(4, bw / 2)} className={`water-bar${v >= goal ? " met" : ""}${d === picked ? " sel" : ""}`} />}
              {d === today && <circle cx={k * slot + slot / 2} cy={H + 8} r={2.5} className="water-today-dot" />}
            </g>
          );
        })}
        <line x1={0} x2={W} y1={y(goal)} y2={y(goal)} className="water-goal" />
        <text x={W - 2} y={y(goal) - 4} textAnchor="end" className="water-goal-label">
          goal {fmtWater(goal, unit)}
        </text>
      </svg>
      <div className="row-between small faint">
        <span>{format(parseISO(days[0]), "MMM d")}</span>
        <span>{differenceInCalendarDays(parseISO(days[n - 1]), parseISO(days[0])) + 1} days</span>
        <span>today</span>
      </div>
    </div>
  );
}

function WaterSettingsSheet({ s, onClose }: { s: WaterSettings; onClose: () => void }) {
  const { meId, nameOf, toast } = useApp();
  const [unit, setUnit] = useState(s.unit);
  const [goal, setGoal] = useState(String(fromMl(s.goal_ml, s.unit)));
  const [sizes, setSizes] = useState(s.sizes_ml.map((ml) => String(fromMl(ml, s.unit))).join(", "));
  const [onHome, setOnHome] = useState(s.on_home);
  const switchUnit = (u: "oz" | "ml") => {
    if (u === unit) return;
    const conv = (v: string) => String(fromMl(toMl(Number(v) || 0, unit), u));
    setGoal(conv(goal));
    setSizes(
      sizes
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(conv)
        .join(", "),
    );
    setUnit(u);
  };
  async function save() {
    const g = Number(goal);
    if (!(g > 0)) return toast("Set a goal above 0");
    const list = sizes
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => n > 0)
      .slice(0, 6)
      .map((n) => toMl(n, unit));
    const { error } = await supabaseBrowser()
      .from("water_settings")
      .upsert({ user_id: s.user_id, goal_ml: toMl(g, unit), unit, sizes_ml: list.length ? list : s.sizes_ml, on_home: onHome, updated_at: new Date().toISOString() });
    if (error) return toast(error.message);
    refreshAll();
    toast("Saved");
    onClose();
  }
  return (
    <Sheet title={s.user_id === meId ? "My water goal" : `${nameOf(s.user_id)}'s water goal`} onClose={onClose}>
      <div className="stack">
        <div className="field">
          <span>Units</span>
          <div className="seg seg-sm" role="group" aria-label="Units">
            <button aria-pressed={unit === "oz"} onClick={() => switchUnit("oz")}>
              oz
            </button>
            <button aria-pressed={unit === "ml"} onClick={() => switchUnit("ml")}>
              ml
            </button>
          </div>
        </div>
        <label className="field">
          <span>Daily goal ({unit})</span>
          <input className="input input-sm" inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value.replace(/[^\d.]/g, ""))} />
        </label>
        <label className="field">
          <span>Quick-add buttons ({unit}, comma separated)</span>
          <input className="input input-sm" value={sizes} onChange={(e) => setSizes(e.target.value)} />
        </label>
        {s.user_id === meId && (
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={onHome} onChange={(e) => setOnHome(e.target.checked)} />
            <span>Show water on my Home</span>
          </label>
        )}
        <button className="btn btn-primary btn-block" onClick={save}>
          Save
        </button>
      </div>
    </Sheet>
  );
}
