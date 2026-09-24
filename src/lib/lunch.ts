import type { FoodFilters } from "./food";

export type LunchPlace = "home" | "work" | "out";
export type LunchRef = { kind: "place" | "meal"; id: string };
export type LunchMsgKind = "propose" | "filters" | "request" | "options" | "decided";

export interface LunchMsg {
  id: string;
  day: string;
  author: string;
  kind: LunchMsgKind;
  refs: LunchRef[];
  filters: FoodFilters | null;
  created_at: string;
}

/** Whose work "work" means. Matched against display names; falls back to "Work". */
export const WORK_OWNER = "Parker";

/** At home or work, eating out means something that can come to you. */
export const needsTakeout = (place: LunchPlace | null) => place === "home" || place === "work";
