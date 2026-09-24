"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { ago, useNow } from "@/lib/dates";
import { notify } from "@/lib/notify";
import { VIBES, vibeLabel, type VibeCheck } from "@/lib/vibe";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

// Answers older than this stop showing on Home.
const SHOW_ANSWER_MS = 24 * 60 * 60 * 1000;

/** Ask for a vibe check, answer one, see theirs. */
export function VibeWidget() {
  const { meId, partner, toast } = useApp();
  const supabase = supabaseBrowser();
  const [answering, setAnswering] = useState<VibeCheck | null>(null);
  const now = useNow()?.getTime() ?? 0;
  const recent = (iso: string | null) => !!iso && now - Date.parse(iso) < SHOW_ANSWER_MS;

  const { data: checks = [] } = useLive<VibeCheck[]>(
    "vibe_checks",
    async () => {
      const { data, error } = await supabase.from("vibe_checks").select("*").order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data as VibeCheck[];
    },
    ["vibe_checks"],
  );
  if (!partner) return null;

  const incoming = checks.find((c) => c.to_user === meId && !c.answered_at);
  const outgoing = checks.find((c) => c.from_user === meId && !c.answered_at);
  const theirAnswer = checks.find((c) => c.from_user === meId && recent(c.answered_at));
  const iJustAnswered = checks.find((c) => c.to_user === meId && recent(c.answered_at));

  async function ask() {
    const { data, error } = await supabase.from("vibe_checks").insert({ from_user: meId, to_user: partner!.id }).select("id").single();
    if (error) return toast(error.message);
    notify({ kind: "vibe", id: data.id });
    refreshAll();
    toast(`Asked ${partner!.display_name} 💭`);
  }

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="row-between">
        <strong>Vibe check</strong>
        {!outgoing && (
          <button className="btn btn-sm" onClick={ask}>
            Ask {partner.display_name}
          </button>
        )}
      </div>
      <div className="stack-sm" style={{ marginTop: 8 }}>
        {incoming && (
          <div className="row-between wrap">
            <span>{partner.display_name} wants a vibe check 💭</span>
            <button className="btn btn-sm btn-primary" onClick={() => setAnswering(incoming)}>
              Answer
            </button>
          </div>
        )}
        {outgoing && <p className="small muted">Waiting on {partner.display_name}… (asked {ago(outgoing.created_at)})</p>}
        {theirAnswer && (
          <p>
            <strong>{partner.display_name}:</strong> {vibeLabel(theirAnswer.choice)}
            {theirAnswer.answer && <span> “{theirAnswer.answer}”</span>}
            <span className="small faint"> · {ago(theirAnswer.answered_at!)}</span>
          </p>
        )}
        {iJustAnswered && !outgoing && !theirAnswer && (
          <p className="small muted">You answered {ago(iJustAnswered.answered_at!)}. Want theirs? Tap “Ask {partner.display_name}”.</p>
        )}
        {!incoming && !outgoing && !theirAnswer && !iJustAnswered && <p className="small muted">How&apos;s everybody doing?</p>}
      </div>
      {answering && <AnswerSheet check={answering} onClose={() => setAnswering(null)} />}
    </section>
  );
}

function AnswerSheet({ check, onClose }: { check: VibeCheck; onClose: () => void }) {
  const { partner, toast } = useApp();
  const [choice, setChoice] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const { error } = await supabaseBrowser()
      .from("vibe_checks")
      .update({ choice, answer: answer.trim() || null, answered_at: new Date().toISOString() })
      .eq("id", check.id);
    setBusy(false);
    if (error) return toast(error.message);
    notify({ kind: "vibe", id: check.id });
    refreshAll();
    toast("Sent 💛");
    onClose();
  }

  return (
    <Sheet title="How's your vibe?" onClose={onClose}>
      <div className="stack">
        <div className="vibe-grid" role="radiogroup" aria-label="Vibe">
          {VIBES.map((v) => (
            <button key={v.v} type="button" role="radio" aria-checked={choice === v.v} className="chip" onClick={() => setChoice(choice === v.v ? null : v.v)}>
              {v.label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Or in your own words</span>
          <textarea className="textarea" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Long day, but the dogs helped…" />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy || (!choice && !answer.trim())} onClick={submit}>
          Send to {partner?.display_name ?? "them"}
        </button>
      </div>
    </Sheet>
  );
}
