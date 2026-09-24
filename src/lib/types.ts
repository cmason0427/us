export type EventType = "confirmed" | "solo" | "ask" | "radar";
export type AskStatus = "pending" | "accepted" | "declined";
export type Energy = "low" | "medium" | "high";
export type Urgency = "low" | "medium" | "high";
export type ListType = "personal" | "shared" | "household" | "dogs";
export type Setting = "home" | "out";
export type Cost = "free" | "cheap" | "splurge";
export type Duration = "quick" | "few_hours" | "all_day";

export interface Profile {
  id: string;
  display_name: string;
  timezone: string;
  notify_partner_posts: boolean;
  notify_reminders: boolean;
  notify_asks: boolean;
  notify_energy: boolean;
}

export interface CalEvent {
  id: string;
  title: string;
  type: EventType;
  start_time: string;
  end_time: string | null;
  all_day: boolean;
  notes: string | null;
  location: string | null;
  response_status: AskStatus | null;
  responded_at: string | null;
  /** Why they can't make it (declined asks). */
  decline_note: string | null;
  /** A new start time they suggested when declining. */
  proposed_start: string | null;
  reminder_lead_minutes: number | null;
  reminder_sent_at: string | null;
  created_by: string;
  created_at: string;
}

export interface PostPhoto {
  id: string;
  post_id: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  position: number;
}

export interface Post {
  id: string;
  author: string;
  text: string | null;
  /** Dog ids this update is about (src/lib/dogs.ts); non-empty = a dog note. */
  dogs: string[];
  /** Written as a dog note: shown as from the dog(s), not the author. */
  as_dog: boolean;
  /** Set on the automatic posts for asks (sent, answered, moved). */
  event_id: string | null;
  created_at: string;
  post_photos: PostPhoto[];
}

export interface Activity {
  id: string;
  name: string;
  energy_level: Energy;
  /** null = needs both of you */
  participant: string | null;
  /** null = works at home or out */
  setting: Setting | null;
  /** Optional; null = not set (passes any filter). */
  cost: Cost | null;
  duration: Duration | null;
  created_by: string;
}

export interface Checkin {
  id: string;
  user_id: string;
  energy: Energy;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  list_type: ListType;
  owner: string | null;
  urgency: Urgency;
  /** When it's due; null = no deadline. */
  due_at: string | null;
  /** "By end of day": due_at is that day's local end, shown as a day. */
  due_all_day: boolean;
  /** Who said "I'll do it" (shared lists). */
  claimed_by: string | null;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
  created_by: string;
  created_at: string;
}

/**
 * How an event should look/behave right now. An answered "ask" stops being an
 * ask: accepted → confirmed, declined → the creator's solo FYI.
 */
export function effectiveType(e: Pick<CalEvent, "type" | "response_status">): EventType {
  if (e.type !== "ask") return e.type;
  if (e.response_status === "accepted") return "confirmed";
  if (e.response_status === "declined") return "solo";
  return "ask";
}

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  confirmed: "Both of us",
  solo: "Solo · FYI",
  ask: "Ask",
  radar: "On the radar",
};

export const EVENT_TYPE_HINT: Record<EventType, string> = {
  confirmed: "We're both going.",
  solo: "Just me — so you know.",
  ask: "Can you make it? Needs a yes/no.",
  radar: "Neither committed, just visible.",
};

export const URGENCY_RANK: Record<Urgency, number> = { high: 0, medium: 1, low: 2 };
export const ENERGY_RANK: Record<Energy, number> = { low: 0, medium: 1, high: 2 };
