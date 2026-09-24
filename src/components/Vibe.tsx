"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { ago, useNow } from "@/lib/dates";
import { notify } from "@/lib/notify";
import { VIBES, vibeLabels, type VibeCheck } from "@/lib/vibe";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

// Vibe things leave Home after an hour. Answers stay in the feed for good.
const SHOW_MS = 60 * 60 * 1000;

/** Vibe checks between you: one waiting on you, one you sent, their latest answer. */
export function useVibe() {
  const { meId, partner, toast } = useApp();
  const supabase = supabaseBrowser();
  const now = useNow()?.getTime() ?? 0;
  const recent = (iso: string | null) => !!iso && now - Date.parse(iso) < SHOW_MS;
  const { data: checks = [] } = useLive<VibeCheck[]>(
    "vibe_checks",
    async () => {
      const { data, error } = await supabase.from("vibe_checks").select("*").order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data as VibeCheck[];
    },
    ["vibe_checks"],
  );
  // Unanswered asks (to answer: ＋ → Vibe check, any time).
  const pendingIn = checks.find((c) => c.to_user === meId && c.from_user !== meId && !c.answered_at);
  const outgoing = checks.find((c) => c.from_user === meId && c.to_user !== meId && !c.answered_at);
  // What Home shows: only the last hour.
  const incoming = pendingIn && recent(pendingIn.created_at) ? pendingIn : undefined;
  const recentOutgoing = outgoing && recent(outgoing.created_at) ? outgoing : undefined;
  // Their latest vibe, asked for or not.
  const theirAnswer = partner ? checks.find((c) => c.to_user === partner.id && recent(c.answered_at)) : undefined;

  async function ask() {
    if (!partner) return false;
    const { data, error } = await supabase.from("vibe_checks").insert({ from_user: meId, to_user: partner.id }).select("id").single();
    if (error) {
      toast(error.message);
      return false;
    }
    notify({ kind: "vibe", id: data.id });
    refreshAll();
    toast(`Asked ${partner.display_name} 💭`);
    return true;
  }
  return { incoming, pendingIn, outgoing, recentOutgoing, theirAnswer, ask };
}

export const vibeText = (c: VibeCheck) => vibeLabels(c.choices.length ? c.choices : c.choice ? [c.choice] : []);

/** From the ＋ menu: ask how they're doing (or answer theirs, if they asked first). */
export function VibeAsk({ onDone }: { onDone: () => void }) {
  const { partner } = useApp();
  const { pendingIn, outgoing, ask } = useVibe();
  const [answering, setAnswering] = useState<"theirs" | "mine" | null>(null);
  if (!partner) return null;
  if (answering) return <AnswerSheet check={answering === "theirs" ? (pendingIn ?? null) : null} onClose={onDone} />;
  return (
    <div className="stack">
      {pendingIn && (
        <button className="btn btn-block" onClick={() => setAnswering("theirs")}>
          {partner.display_name} asked how you&apos;re doing. Answer?
        </button>
      )}
      {!pendingIn && (
        <button className="btn btn-block" onClick={() => setAnswering("mine")}>
          💭 Share how I&apos;m doing
        </button>
      )}
      {outgoing ? (
        <p className="muted">You already asked {ago(outgoing.created_at)}. It&apos;s waiting for {partner.display_name} whenever.</p>
      ) : (
        <>
          <p className="muted">A quiet “how&apos;s it going?” {partner.display_name} can answer whenever.</p>
          <button className="btn btn-primary btn-block" onClick={async () => (await ask()) && onDone()}>
            Ask {partner.display_name}
          </button>
        </>
      )}
    </div>
  );
}

/** Answer their ask, or (check = null) send how you're doing unprompted. Either way it goes in the feed. */
export function AnswerSheet({ check, onClose }: { check: VibeCheck | null; onClose: () => void }) {
  const { meId, partner, toast } = useApp();
  // Pick as many as fit.
  const [choices, setChoices] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const supabase = supabaseBrowser();
    const fields = { choices, answer: answer.trim() || null, answered_at: new Date().toISOString() };
    const { data, error } = check
      ? await supabase.from("vibe_checks").update(fields).eq("id", check.id).select("id").single()
      : await supabase.from("vibe_checks").insert({ from_user: meId, to_user: meId, ...fields }).select("id").single();
    if (error) {
      setBusy(false);
      return toast(error.message);
    }
    const text = `💭 ${vibeLabels(choices) || "Vibe"}${fields.answer ? ` — “${fields.answer}”` : ""}`;
    await supabase.from("posts").insert({ author: meId, kind: "vibe", vibe_id: data.id, text });
    setBusy(false);
    notify({ kind: "vibe", id: data.id });
    refreshAll();
    toast("Sent 💛");
    onClose();
  }

  return (
    <Sheet title="How's your vibe? (pick any)" onClose={onClose}>
      <div className="stack">
        <div className="vibe-grid" role="group" aria-label="Vibe (pick any)">
          {VIBES.map((v) => (
            <button
              key={v.v}
              type="button"
              className="chip"
              aria-pressed={choices.includes(v.v)}
              onClick={() => setChoices((c) => (c.includes(v.v) ? c.filter((x) => x !== v.v) : [...c, v.v]))}
            >
              {v.label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Or in your own words</span>
          <textarea className="textarea" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Long day, but the dogs helped…" />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy || (!choices.length && !answer.trim())} onClick={submit}>
          Send to {partner?.display_name ?? "them"}
        </button>
      </div>
    </Sheet>
  );
}
