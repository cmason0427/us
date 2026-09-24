"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";

/**
 * Color markers for calendar things: a stripe on the edge, separate from the
 * kind of plan (who's going, which sets the fill). Either of you can name
 * what a color means ("pink = health").
 */
export const CAL_COLORS = ["red", "orange", "yellow", "green", "blue", "purple", "pink"] as const;
export type CalColor = (typeof CAL_COLORS)[number];

export const colorVar = (c: string) => `var(--pop-${c})`;

export function useColorLabels() {
  const { data = [] } = useLive<{ color: string; label: string | null }[]>(
    "calendar_colors",
    async () => {
      const { data, error } = await supabaseBrowser().from("calendar_colors").select("color, label");
      if (error) throw error;
      return data;
    },
    ["calendar_colors"],
  );
  const labels: Record<string, string | undefined> = {};
  for (const r of data) if (r.label) labels[r.color] = r.label;
  return labels;
}

export function Swatch({ color, size = 14 }: { color: string; size?: number }) {
  return <span className="cal-swatch" style={{ width: size, height: size, background: colorVar(color) }} aria-hidden />;
}

/** Pick a color marker (or none). Named colors show their names. */
export function ColorPicker({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) {
  const labels = useColorLabels();
  const [naming, setNaming] = useState(false);
  return (
    <div className="stack-sm">
      <div className="chips" role="group" aria-label="Color marker">
        <button type="button" className="chip chip-sm" aria-pressed={value === null} onClick={() => onChange(null)}>
          None
        </button>
        {CAL_COLORS.map((c) => (
          <button key={c} type="button" className="chip chip-sm" aria-pressed={value === c} onClick={() => onChange(value === c ? null : c)} aria-label={labels[c] ?? c}>
            <Swatch color={c} />
            {labels[c] && <span>{labels[c]}</span>}
          </button>
        ))}
        <button type="button" className="btn-link small" onClick={() => setNaming((n) => !n)}>
          {naming ? "Done" : "Name colors"}
        </button>
      </div>
      {naming && <ColorNamer />}
    </div>
  );
}

/** Give colors meanings, shared by both of you. */
export function ColorNamer() {
  const labels = useColorLabels();
  async function save(color: string, label: string) {
    await supabaseBrowser()
      .from("calendar_colors")
      .upsert({ color, label: label.trim() || null, updated_at: new Date().toISOString() });
    refreshAll();
  }
  return (
    <div className="card stack-sm" style={{ padding: "8px 12px" }}>
      {CAL_COLORS.map((c) => (
        <label key={c} className="row">
          <Swatch color={c} size={18} />
          <input className="input grow" defaultValue={labels[c] ?? ""} key={labels[c] ?? ""} placeholder={`What ${c} means (optional)`} onBlur={(e) => e.target.value !== (labels[c] ?? "") && save(c, e.target.value)} />
        </label>
      ))}
    </div>
  );
}
