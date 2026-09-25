"use client";

import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import { useApp } from "./AppProvider";

/**
 * Once something's been answered, clearing it takes both of you: each taps
 * reset, and when both have, it's gone. (It also clears itself at the end of
 * the day.) `match` picks the row, e.g. { id } or { user_id }.
 */
export function ResetVotes({ table, match, votes }: { table: "deck_calls" | "statuses"; match: Record<string, string>; votes: string[] }) {
  const { meId, partner, toast } = useApp();
  const mine = votes.includes(meId);
  const theirs = !!partner && votes.includes(partner.id);
  async function vote() {
    const supabase = supabaseBrowser();
    const next = mine ? votes.filter((v) => v !== meId) : [...new Set([...votes, meId])];
    const { error } =
      !mine && theirs
        ? await supabase.from(table).delete().match(match)
        : await supabase.from(table).update({ reset_votes: next }).match(match);
    if (error) toast(error.message);
    else if (!mine && theirs) toast("Reset 🔄");
    refreshAll();
  }
  return (
    <span className="row wrap small" style={{ gap: 6 }}>
      <button type="button" className="btn btn-sm btn-ghost" onClick={vote}>
        {mine ? "↩ undo reset" : theirs ? `🔄 reset (${partner?.display_name} already did)` : "🔄 reset"}
      </button>
      {mine && <span className="faint">waiting on {partner?.display_name} to reset too · clears itself tonight anyway</span>}
    </span>
  );
}
