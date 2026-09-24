"use client";

import { useState } from "react";
import { addDays } from "date-fns";
import { fromInputs, toDateInput, toTimeInput } from "@/lib/dates";
import { endOfDayDeadline, type Deadline } from "@/lib/deadline";
import { WhenPicker } from "./WhenPicker";

type Mode = "none" | "today" | "tomorrow" | "pick";

function modeOf(d: Deadline | null): Mode {
  if (!d) return "none";
  if (d.due_all_day) {
    const key = toDateInput(new Date(d.due_at));
    if (key === toDateInput(new Date())) return "today";
    if (key === toDateInput(addDays(new Date(), 1))) return "tomorrow";
  }
  return "pick";
}

/** No deadline, end of today, tomorrow, or a picked day (with an optional time). */
export function DeadlinePicker({ value, onChange }: { value: Deadline | null; onChange: (d: Deadline | null) => void }) {
  const [mode, setMode] = useState<Mode>(modeOf(value));
  const seed = value ? new Date(value.due_at) : addDays(new Date(), 1);
  const [date, setDate] = useState(toDateInput(seed));
  // Empty time = by end of that day.
  const [time, setTime] = useState(value && !value.due_all_day ? toTimeInput(seed) : "");

  const picked = (d: string, t: string): Deadline | null => {
    if (!d) return null;
    return t ? { due_at: fromInputs(d, t).toISOString(), due_all_day: false } : endOfDayDeadline(fromInputs(d));
  };

  function pickMode(m: Mode) {
    setMode(m);
    if (m === "none") onChange(null);
    if (m === "today") onChange(endOfDayDeadline(new Date()));
    if (m === "tomorrow") onChange(endOfDayDeadline(addDays(new Date(), 1)));
    if (m === "pick") onChange(picked(date, time));
  }

  return (
    <div className="stack-sm">
      <div className="chips" role="group" aria-label="Deadline">
        {(
          [
            ["none", "No deadline"],
            ["today", "End of today"],
            ["tomorrow", "Tomorrow"],
            ["pick", "📅 Pick…"],
          ] as const
        ).map(([m, label]) => (
          <button key={m} type="button" className="chip" aria-pressed={mode === m} onClick={() => pickMode(m)}>
            {label}
          </button>
        ))}
      </div>
      {mode === "pick" && (
        <WhenPicker
          mode="deadline"
          value={{ date, start: time }}
          onChange={(w) => {
            setDate(w.date);
            setTime(w.start ?? "");
            onChange(picked(w.date, w.start ?? ""));
          }}
        />
      )}
    </div>
  );
}
