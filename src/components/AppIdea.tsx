"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useApp } from "./AppProvider";

// "💡 An idea for the app": type it right on Home and send. It goes to a quiet
// inbox only Claude reads (a little file in storage, under your own folder);
// nothing is listed in the app, so there's no backlog staring at anyone.

export function AppIdeaRow() {
  const { meId, toast } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const idea = text.trim();
    if (!idea || busy) return;
    setBusy(true);
    const at = new Date().toISOString();
    const body = new Blob([JSON.stringify({ idea, by: meId, at })], { type: "text/plain" });
    const path = `${meId}/ideas/${at.replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 6)}.txt`;
    const { error } = await supabaseBrowser().storage.from("photos").upload(path, body, { contentType: "text/plain" });
    setBusy(false);
    if (error) return toast(`Couldn't save it: ${error.message}`);
    setText("");
    toast("Got it 💡 tucked away for the next update");
  }

  return (
    <form className="dash-row dash-idea" onSubmit={send}>
      <span className="dash-icon" aria-hidden>
        💡
      </span>
      <span className="grow">
        <span className="dash-label">An idea for the app</span>
        <input className="dash-idea-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="type it, send it, forget it…" aria-label="An idea for the app" maxLength={2000} enterKeyHint="send" />
      </span>
      {text.trim() && (
        <button className="btn btn-sm btn-primary" disabled={busy} aria-label="Send the idea">
          {busy ? "…" : "Send"}
        </button>
      )}
    </form>
  );
}
