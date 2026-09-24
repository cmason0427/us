import type { Activity, Cost, Duration, Setting } from "./types";

export const SETTING_OPTIONS: { v: Setting; label: string; filter: string }[] = [
  { v: "home", label: "🏡 At home", filter: "🏡 Stay in" },
  { v: "out", label: "🚗 Going out", filter: "🚗 Go out" },
];
export const COST_OPTIONS: { v: Cost; label: string }[] = [
  { v: "free", label: "Free" },
  { v: "cheap", label: "$ Cheap" },
  { v: "splurge", label: "$$$ Splurge" },
];
export const DURATION_OPTIONS: { v: Duration; label: string }[] = [
  { v: "quick", label: "Under an hour" },
  { v: "few_hours", label: "A few hours" },
  { v: "all_day", label: "All day" },
];

export const KEEP_OPTIONS = [
  { v: "keep", label: "♾️ Keep on the list" },
  { v: "once", label: "☝️ One-time" },
];

/** Done one-time ideas aren't suggested anymore. */
export const isActive = (a: Activity) => a.recurring || !a.done_at;

export interface ActivityFilters {
  setting: Setting | null;
  cost: Cost | null;
  duration: Duration | null;
}
export const NO_FILTERS: ActivityFilters = { setting: null, cost: null, duration: null };

/** Every filter is optional, and an idea that doesn't say passes that filter. */
export const matchesFilters = (a: Activity, f: ActivityFilters) =>
  (!f.setting || !a.setting || a.setting === f.setting) &&
  (!f.cost || !a.cost || a.cost === f.cost) &&
  (!f.duration || !a.duration || a.duration === f.duration);

export const labelOf = <T extends string>(opts: { v: T; label: string }[], v: T | null) => opts.find((o) => o.v === v)?.label;
