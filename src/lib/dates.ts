import { format } from "date-fns";
import { useSyncExternalStore } from "react";

/** Value for <input type="date"> in local time. */
export const toDateInput = (d: Date) => format(d, "yyyy-MM-dd");
/** Value for <input type="time"> in local time. */
export const toTimeInput = (d: Date) => format(d, "HH:mm");

/** Combine local date + time inputs into a Date. */
export function fromInputs(date: string, time = "00:00") {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export function timeLabel(d: Date) {
  return format(d, d.getMinutes() ? "h:mm a" : "h a").toLowerCase();
}

/** "just now", "12 min ago", "3 hr ago", then a date. */
export function ago(iso: string, now = Date.now()) {
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    const rem = mins % 60;
    return rem && hrs < 6 ? `${hrs} hr ${rem} min ago` : `${hrs} hr ago`;
  }
  const d = new Date(iso);
  return format(d, hrs < 24 * 6 ? "EEE h:mm a" : "MMM d");
}

// ─── client clock ──────────────────────────────────────────────────────────
// Time-of-day text must only render in the browser: the server runs in UTC
// and would disagree with the phone's clock (hydration mismatch).

const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;
function subscribeMinute(fn: () => void) {
  const t = setInterval(fn, 30_000);
  return () => clearInterval(t);
}

/** Current time rounded to the minute; null during server render. */
export function useNow(): Date | null {
  const ms = useSyncExternalStore(subscribeMinute, minuteNow, () => null);
  return ms === null ? null : new Date(ms);
}
