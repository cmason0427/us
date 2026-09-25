import { addDays, addYears, getYear, parseISO, setYear, startOfDay } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { occurrences } from "@/lib/series";
import { toDateInput } from "@/lib/dates";

/** Next time a yyyy-mm-dd date comes around (today counts). */
export function nextOccurrence(iso: string, today = new Date()): Date {
  const d = parseISO(iso);
  let next = setYear(d, getYear(today));
  if (next < startOfDay(today)) next = setYear(d, getYear(today) + 1);
  return next;
}
/** Whole days until the next one (0 = today). */
export const daysUntil = (iso: string, today = new Date()) => Math.round((nextOccurrence(iso, today).getTime() - startOfDay(today).getTime()) / 86400000);
/** How many years it'll be at the next one (age, or years together). */
export const yearsAtNext = (iso: string, today = new Date()) => getYear(nextOccurrence(iso, today)) - getYear(parseISO(iso));

export function untilText(days: number) {
  if (days === 0) return "today! 🎉";
  if (days === 1) return "tomorrow";
  if (days < 60) return `in ${days} days`;
  return `in ${Math.round(days / 30)} months`;
}

/** A fixed title, or one worked out per year ("27th birthday"). */
type Title = string | ((d: Date) => string);

/** 1st, 2nd, 3rd, 4th… 11th, 12th, 13th, 21st. */
export function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}
/** "🎂 jo's 34th birthday" when the birth year is known, else "🎂 jo's birthday". */
export const birthdayTitle = (name: string, birthYear?: number | null) => (d: Date) =>
  birthYear && d.getFullYear() > birthYear ? `🎂 ${name}'s ${ordinal(d.getFullYear() - birthYear)} birthday` : `🎂 ${name}'s birthday`;

/**
 * Put a date on the calendar every year (all day, for both of you), starting
 * from its next time around. Returns the series id to remember it by.
 */
export async function addYearly(title: Title, iso: string, meId: string, notes?: string | null): Promise<string | null> {
  const first = nextOccurrence(iso);
  return addYearlyDates(title, occurrences(first, "yearly", addYears(first, 30)), meId, notes);
}

/** Same, for dates you've already worked out (Thanksgiving moves around). */
export async function addYearlyDates(title: Title, starts: Date[], meId: string, notes?: string | null): Promise<string | null> {
  if (!starts.length) return null;
  const supabase = supabaseBrowser();
  const until = starts[starts.length - 1];
  const { data: series, error } = await supabase
    .from("event_series")
    .insert({ freq: "yearly", until: toDateInput(until), created_by: meId })
    .select("id")
    .single();
  if (error || !series) return null;
  const { error: e2 } = await supabase.from("events").insert(
    starts.map((s) => ({
      title: typeof title === "function" ? title(s) : title,
      type: "confirmed",
      all_day: true,
      start_time: s.toISOString(),
      end_time: addDays(s, 1).toISOString(),
      notes: notes ?? null,
      series_id: series.id,
      created_by: meId,
    })),
  );
  if (e2) {
    await supabase.from("event_series").delete().eq("id", series.id);
    return null;
  }
  return series.id;
}

/** Take a yearly date back off the calendar (every time it appears). */
export async function removeYearly(seriesId: string) {
  const supabase = supabaseBrowser();
  await supabase.from("events").delete().eq("series_id", seriesId);
  await supabase.from("event_series").delete().eq("id", seriesId);
}
