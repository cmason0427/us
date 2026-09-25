"use client";

import { useEffect } from "react";
import { format } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import { useApp } from "./AppProvider";
import { useTaskPresets } from "./TaskForm";

/**
 * Presets marked "every day" (feed breakfast, feed dinner…) add themselves
 * once a day, whichever phone opens the app first. Yesterday's unchecked
 * ones quietly go away instead of piling up as overdue.
 */
export function DailyRoutines() {
  const { meId } = useApp();
  const presets = useTaskPresets();
  const daily = presets.filter((p) => p.daily);
  const key = daily.map((p) => `${p.id}:${p.window_end ?? ""}`).join(",");

  useEffect(() => {
    if (!key || !meId) return;
    const supabase = supabaseBrowser();
    const now = new Date();
    const today = format(now, "yyyy-MM-dd");
    const run = async () => {
      await supabase.from("tasks").delete().not("template_id", "is", null).lt("for_day", today).eq("done", false);
      const rows = daily.flatMap((p) => {
        let due: string | null = null;
        if (p.window_end) {
          const [h, m] = p.window_end.slice(0, 5).split(":").map(Number);
          const d = new Date(now);
          d.setHours(h, m, 0, 0);
          // Today's window already closed before anyone looked: skip today.
          if (d <= now) return [];
          due = d.toISOString();
        }
        return [
          {
            title: p.title,
            list_type: p.list_type,
            dogs: p.dogs,
            urgency: p.urgency,
            notes: p.notes,
            window_start: p.window_start,
            due_at: due,
            due_all_day: false,
            template_id: p.id,
            for_day: today,
            created_by: meId,
          },
        ];
      });
      if (!rows.length) return;
      const { data } = await supabase.from("tasks").upsert(rows, { onConflict: "template_id,for_day", ignoreDuplicates: true }).select("id");
      if (data?.length) refreshAll();
    };
    run();
    // Re-check when the app comes back to the front (a new day, maybe).
    const onVis = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, meId]);

  return null;
}
