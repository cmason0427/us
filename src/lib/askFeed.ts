"use client";

import { format } from "date-fns";
import { supabaseBrowser } from "./supabase/client";
import type { CalEvent } from "./types";

export const eventWhen = (iso: string, allDay: boolean) => format(new Date(iso), allDay ? "EEE, MMM d" : "EEE, MMM d · h:mm a");

type AskUpdate =
  | { kind: "sent" }
  | { kind: "accepted" }
  | { kind: "declined"; note: string | null; proposed: string | null }
  | { kind: "moved" };

/**
 * Every step of an ask (sent, answered, moved) also lands in the feed, so the
 * back-and-forth is in one place. Posted as whoever took the step; the post
 * links back to the event. Best-effort: the calendar is the source of truth.
 */
export async function postAskUpdate(e: Pick<CalEvent, "id" | "title" | "start_time" | "all_day">, meId: string, u: AskUpdate) {
  const what = `${e.title} · ${eventWhen(e.start_time, e.all_day)}`;
  const text =
    u.kind === "sent"
      ? `💌 Can you make it? ${what}`
      : u.kind === "accepted"
        ? `🎉 I'm in for ${what}`
        : u.kind === "moved"
          ? `🔁 Moved ${what}. Can you make it now?`
          : [
              `😕 Can't make ${what}`,
              u.note ? `"${u.note}"` : null,
              u.proposed ? `How about ${eventWhen(u.proposed, e.all_day)} instead?` : null,
            ]
              .filter(Boolean)
              .join("\n");
  await supabaseBrowser().from("posts").insert({ author: meId, text, event_id: e.id });
}
