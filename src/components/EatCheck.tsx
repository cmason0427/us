"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { ago } from "@/lib/dates";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

// "DID YOU EAT?": a loud little check-in. Asking never posts; the answer
// does, as a reply to the ask, and whoever answered can update it later
// (the asker gets a push each time).

export type EatAnswer = "yes" | "no" | "working";
export interface EatCheck {
  id: string;
  from_user: string;
  to_user: string;
  answer: EatAnswer | null;
  note: string | null;
  asked_at: string;
  answered_at: string | null;
  updated_at: string | null;
  created_at: string;
}

export const EAT_LABEL: Record<EatAnswer, { label: string; emoji: string }> = {
  yes: { label: "YES", emoji: "✅" },
  no: { label: "NO", emoji: "❌" },
  working: { label: "WORKING ON IT", emoji: "🍳" },
};

export function useEatChecks() {
  const { data = [] } = useLive<EatCheck[]>(
    "eat_checks",
    async () => {
      const { data, error } = await supabaseBrowser().from("eat_checks").select("*").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data as EatCheck[];
    },
    ["eat_checks"],
  );
  return data;
}

/** Ask (or, if they haven't answered yet, ask AGAIN). */
export async function sendEatCheck(meId: string, partnerId: string, pending: EatCheck | undefined) {
  const db = supabaseBrowser();
  if (pending) {
    const { error } = await db.from("eat_checks").update({ asked_at: new Date().toISOString() }).eq("id", pending.id);
    if (error) return error.message;
    notify({ kind: "eat", id: pending.id });
    refreshAll();
    return null;
  }
  const { data, error } = await db.from("eat_checks").insert({ from_user: meId, to_user: partnerId }).select("id").single();
  if (error) return error.message;
  notify({ kind: "eat", id: data.id });
  refreshAll();
  return null;
}

/** The ＋ menu entry: one big red button. */
export function EatAsk({ onDone }: { onDone: () => void }) {
  const { meId, partner, toast } = useApp();
  const checks = useEatChecks();
  const pending = checks.find((c) => c.from_user === meId && !c.answered_at);
  if (!partner) return null;
  return (
    <div className="stack">
      <button
        className="eat-shout"
        onClick={async () => {
          const err = await sendEatCheck(meId, partner.id, pending);
          if (err) return toast(err);
          toast(pending ? `Asked ${partner.display_name} AGAIN 🚨` : `Asked ${partner.display_name} 🚨`);
          onDone();
        }}
      >
        🚨 {pending ? "ASK AGAIN" : "DID YOU EAT?"}
      </button>
      <p className="small muted" style={{ margin: 0 }}>
        {pending ? `Still no answer since ${ago(pending.asked_at)}. This pings ${partner.display_name} again.` : `${partner.display_name} gets a push and a big red row on Home. The ask doesn't go in the feed; their answer does.`}
      </p>
    </div>
  );
}

/** Answer (or update your answer). The answer posts to the feed as a reply to the ask. */
export function EatAnswerSheet({ check, onClose }: { check: EatCheck; onClose: () => void }) {
  const { meId, nameOf, toast } = useApp();
  const [answer, setAnswer] = useState<EatAnswer | null>(check.answer);
  const [note, setNote] = useState(check.note ?? "");
  const [busy, setBusy] = useState(false);
  const updating = !!check.answered_at;

  async function send() {
    if (!answer) return;
    setBusy(true);
    const db = supabaseBrowser();
    const now = new Date().toISOString();
    const { error } = await db
      .from("eat_checks")
      .update({ answer, note: note.trim() || null, answered_at: check.answered_at ?? now, updated_at: updating ? now : null })
      .eq("id", check.id);
    if (error) {
      setBusy(false);
      return toast(error.message);
    }
    // One feed post per check-in: made on the first answer, edited after.
    const { data: existing } = await db.from("posts").select("id").eq("eat_check_id", check.id).maybeSingle();
    if (existing) await db.from("posts").update({ text: note.trim() || null }).eq("id", existing.id);
    else await db.from("posts").insert({ author: meId, kind: "eat", eat_check_id: check.id, text: note.trim() || null });
    notify({ kind: "eat", id: check.id });
    refreshAll();
    toast(updating ? "Updated 🍽️" : "Answered 🍽️");
    onClose();
  }

  return (
    <Sheet title={updating ? "Update your answer" : "🚨 DID YOU EAT?"} onClose={onClose}>
      <div className="stack">
        {!updating && <p className="small muted" style={{ margin: 0 }}>{nameOf(check.from_user)} wants to know.</p>}
        <div className="eat-options">
          {(Object.keys(EAT_LABEL) as EatAnswer[]).map((a) => (
            <button key={a} className={`eat-option eat-${a}`} aria-pressed={answer === a} onClick={() => setAnswer(a)}>
              <span className="eat-option-emoji">{EAT_LABEL[a].emoji}</span>
              {EAT_LABEL[a].label}
            </button>
          ))}
        </div>
        <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="the long answer (optional): what, when, why not…" aria-label="Long answer" />
        <button className="btn btn-primary btn-block" disabled={!answer || busy} onClick={send}>
          {busy ? "…" : updating ? "Update it" : "Send"}
        </button>
      </div>
    </Sheet>
  );
}

/** On Home: a loud row when you've been asked, a quiet one while you wait. */
export function EatHomeRows() {
  const { meId, nameOf } = useApp();
  const checks = useEatChecks();
  const [open, setOpen] = useState<EatCheck | null>(null);
  const incoming = checks.find((c) => c.to_user === meId && !c.answered_at);
  const waiting = checks.find((c) => c.from_user === meId && !c.answered_at);
  return (
    <>
      {incoming && (
        <button className="dash-row eat-alarm" onClick={() => setOpen(incoming)}>
          <span className="dash-icon" aria-hidden>
            🚨
          </span>
          <span className="grow">
            <span className="dash-label">DID YOU EAT?</span>
            <span className="dash-value">
              {nameOf(incoming.from_user)} is asking · {ago(incoming.asked_at)}
            </span>
          </span>
          <span className="dash-more" aria-hidden>
            ›
          </span>
        </button>
      )}
      {waiting && (
        <div className="dash-row">
          <span className="dash-icon" aria-hidden>
            🍽️
          </span>
          <span className="grow">
            <span className="dash-label">Did they eat?</span>
            <span className="dash-value muted">
              Asked {nameOf(waiting.to_user)} {ago(waiting.asked_at)} · no answer yet
            </span>
          </span>
        </div>
      )}
      {open && <EatAnswerSheet check={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** The feed card for an answer: the ask it replies to, the answer, and (for whoever answered) an update button. */
export function EatReply({ checkId, author }: { checkId: string; author: string }) {
  const { meId, nameOf } = useApp();
  const checks = useEatChecks();
  const [editing, setEditing] = useState(false);
  const c = checks.find((x) => x.id === checkId);
  if (!c || !c.answer) return null;
  const a = EAT_LABEL[c.answer];
  return (
    <div className="eat-reply">
      <span className="small faint">
        ↪ reply to 🚨 DID YOU EAT? from {c.from_user === meId ? "you" : nameOf(c.from_user)}
      </span>
      <span className={`eat-badge eat-${c.answer}`}>
        {a.emoji} {a.label}
      </span>
      {c.note && <p className="post-text" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{c.note}</p>}
      {(c.updated_at || (author === meId && c.to_user === meId)) && (
        <span className="small faint">
          {c.updated_at ? `updated ${ago(c.updated_at)}` : ""}
          {author === meId && c.to_user === meId && (
            <button className="btn-link small" style={{ marginLeft: c.updated_at ? 8 : 0 }} onClick={() => setEditing(true)}>
              update
            </button>
          )}
        </span>
      )}
      {editing && <EatAnswerSheet check={c} onClose={() => setEditing(false)} />}
    </div>
  );
}
