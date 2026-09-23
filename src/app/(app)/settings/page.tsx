"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { disablePush, enablePush, isStandalone, pushState, type PushState } from "@/lib/pushClient";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Flower, Wavy } from "@/components/Art";

export default function SettingsPage() {
  const { me, meId, partner, toast } = useApp();
  const router = useRouter();
  const supabase = supabaseBrowser();
  // null = untouched, so the field shows the saved name until you type.
  const [draftName, setName] = useState<string | null>(null);
  const name = draftName ?? me?.display_name ?? "";
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    pushState().then((s) => {
      setPush(s);
      setInstalled(isStandalone());
    });
  }, []);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", meId);
    setName(null);
    refreshAll();
    toast("Saved");
  }

  async function togglePush() {
    setBusy(true);
    try {
      setPush(push === "on" ? await disablePush() : await enablePush());
    } catch (err) {
      toast((err as Error).message);
    }
    setBusy(false);
  }

  async function setPostNudge(on: boolean) {
    await supabase.from("profiles").update({ notify_partner_posts: on }).eq("id", meId);
    refreshAll();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="page">
      <PageHead eyebrow="Just for you" title="Settings" art={<Flower width={34} height={34} />} />
      <Wavy />

      <section className="card stack">
        <h2>Your name</h2>
        <form className="quick-add" onSubmit={saveName}>
          <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} aria-label="Display name" />
          <button className="btn btn-primary" disabled={!name.trim() || name.trim() === me?.display_name}>
            Save
          </button>
        </form>
      </section>

      <section className="card stack" style={{ marginTop: 16 }}>
        <h2>Notifications</h2>
        {push === "needs-install" && (
          <p>
            On iPhone, notifications only work from the home-screen app. Tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, open Us from there, and come
            back here.
          </p>
        )}
        {push === "unsupported" && <p className="muted">This browser can&apos;t do push notifications.</p>}
        {push === "denied" && <p className="muted">Notifications are blocked for this app. Turn them back on in your phone&apos;s settings for Us.</p>}
        {(push === "on" || push === "off") && (
          <>
            <div className="toggle-row">
              <span>
                <strong>On this device</strong>
                <br />
                <span className="small muted">Reminders and &ldquo;can you make it?&rdquo; asks.</span>
              </span>
              <label className="switch">
                <input type="checkbox" checked={push === "on"} disabled={busy} onChange={togglePush} />
                <span />
              </label>
            </div>
            {push === "on" && (
              <button
                className="btn btn-sm"
                style={{ alignSelf: "flex-start" }}
                onClick={async () => {
                  const r = await notify({ kind: "test" });
                  toast(r.sent ? "Sent! 🍄" : "Hmm, nothing went out");
                }}
              >
                Send a test
              </button>
            )}
          </>
        )}
        <div className="toggle-row" style={{ borderTop: "1.5px dashed var(--line)", paddingTop: 12 }}>
          <span>
            <strong>Gentle nudge when {partner?.display_name ?? "they"} post{partner ? "s" : ""}</strong>
            <br />
            <span className="small muted">Off by default. One quiet ping, no pressure to reply.</span>
          </span>
          <label className="switch">
            <input type="checkbox" checked={me?.notify_partner_posts ?? false} onChange={(e) => setPostNudge(e.target.checked)} />
            <span />
          </label>
        </div>
      </section>

      {!installed && push !== "needs-install" && (
        <section className="card stack" style={{ marginTop: 16 }}>
          <h2>Put it on your home screen</h2>
          <p className="muted">
            iPhone: Share → Add to Home Screen. Android: browser menu → Install app. It opens full-screen like a real app.
          </p>
        </section>
      )}

      <div className="row" style={{ justifyContent: "center", marginTop: 24 }}>
        <button className="btn" onClick={signOut}>
          Sign out
        </button>
      </div>
    </main>
  );
}
