export type EventType = "confirmed" | "solo" | "ask" | "radar";
export type AskStatus = "pending" | "accepted" | "declined";
export type Energy = "low" | "medium" | "high";
export type Urgency = "low" | "medium" | "high";
export type ListType = "personal" | "shared" | "household";
export type PottyKind = "pee" | "poop" | "both";

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

export interface PostReaction {
  post_id: string;
  user_id: string;
  emoji: string;
}

export interface Post {
  id: string;
  author: string;
  text: string | null;
  created_at: string;
  post_photos: PostPhoto[];
  post_reactions: PostReaction[];
}

export interface Activity {
  id: string;
  name: string;
  energy_level: Energy;
  /** null = needs both of you */
  participant: string | null;
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
  done: boolean;
  done_at: string | null;
  done_by: string | null;
  created_by: string;
  created_at: string;
}

export interface KodoLog {
  id: string;
  type: "potty" | "note";
  potty_kind: PottyKind | null;
  detail: string | null;
  occurred_at: string;
  created_by: string;
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
