"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "./supabase/client";
import { useLive, refreshAll } from "./useLive";

// Tables whose changes can light up a section's dot.
const WATCH = ["events", "tasks", "shop_items", "food_places", "home_meals", "lunch_log", "little_things", "us_dates", "us_date_notes", "people", "activities", "day_plans", "decks", "deck_calls", "watchlist", "garden_items", "garden_reviews", "spicy_items", "spicy_media", "spicy_reactions", "spicy_item_notes", "address_book"];

/**
 * Which menu sections have something new from the other person since you
 * last opened them. Opening a section clears its dot.
 */
export function useSectionBadges(meId: string) {
  const path = usePathname();
  const { data: activity = [] } = useLive<{ section: string; last_at: string | null }[]>(
    "section_activity",
    async () => {
      const { data, error } = await supabaseBrowser().rpc("section_activity");
      if (error) throw error;
      return data;
    },
    WATCH,
  );
  const { data: seen } = useLive<{ section: string; seen_at: string }[]>(
    "section_seen",
    async () => {
      const { data, error } = await supabaseBrowser().from("section_seen").select("section, seen_at");
      if (error) throw error;
      return data;
    },
    ["section_seen"],
  );
  const seenAt = new Map((seen ?? []).map((s) => [s.section, s.seen_at]));
  const fresh = new Set(
    activity.filter((a) => a.last_at && seenAt.has(a.section) && a.last_at > seenAt.get(a.section)! && !path.startsWith(a.section)).map((a) => a.section),
  );

  // First time: start everything as seen (no wall of dots). Afterwards, being
  // on a section keeps it seen, including changes that land while you're there.
  const here = activity.find((a) => path.startsWith(a.section));
  const missing = seen ? activity.filter((a) => !seenAt.has(a.section)).map((a) => a.section) : [];
  const hereKey = here ? `${here.section}:${here.last_at}` : "";
  const missingKey = missing.join(",");
  useEffect(() => {
    const rows = [...missingKey.split(",").filter(Boolean), ...(hereKey ? [hereKey.split(":")[0]] : [])];
    if (!rows.length || !meId) return;
    const now = new Date().toISOString();
    supabaseBrowser()
      .from("section_seen")
      .upsert([...new Set(rows)].map((section) => ({ user_id: meId, section, seen_at: now })))
      .then(() => refreshAll());
  }, [hereKey, missingKey, meId]);

  return fresh;
}
