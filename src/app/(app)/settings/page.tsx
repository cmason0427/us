"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { disablePush, enablePush, isStandalone, pushState, type PushState } from "@/lib/pushClient";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { PinPad } from "@/components/PinPad";
import { DogPhotos } from "@/components/DogPhotos";
import { MyPhoto } from "@/components/MyPhoto";
import { THEMES, applyTheme, currentTheme, type Theme } from "@/lib/theme";
import { Flower, Wavy } from "@/components/Art";

const noSubscribe = () => () => {};

/** Peach or Sage. Per device; takes effect instantly. */
function ThemePicker() {
  const stored = useSyncExternalStore(noSubscribe, currentTheme, () => "peach" as Theme);
  const [picked, setPicked] = useState<Theme | null>(null);
  const theme = picked ?? stored;
  return (
    <div className="seg" role="group" aria-label="Color theme">
      {THEMES.map((t) => (
        <button
          key={t.v}
          aria-pressed={theme === t.v}
          onClick={() => {
            applyTheme(t.v);
            setPicked(t.v);
          }}
        >
          <span className="theme-swatch" data-swatch={t.v} /> {t.label}
        </button>
      ))}
    </div>
  );
}

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

  type Pref = "notify_reminders" | "notify_asks" | "notify_energy" | "notify_partner_posts";
  async function setPref(key: Pref, on: boolean) {
    await supabase.from("profiles").update({ [key]: on }).eq("id", meId);
    refreshAll();
  }
  const partnerName = partner?.display_name ?? "your person";
  const prefs: { key: Pref; label: string; hint: string }[] = [
    { key: "notify_reminders", label: "Reminders", hint: "Before things on the calendar that have a reminder set." },
    { key: "notify_asks", label: "\u201cCan you make it?\u201d asks", hint: `When ${partnerName} asks you to something, or answers your ask.` },
    { key: "notify_energy", label: "Energy check requests", hint: `When ${partnerName} wants to know your energy level.` },
    { key: "notify_partner_posts", label: `Gentle nudge when ${partnerName} posts`, hint: "Off by default. One quiet ping, no pressure to reply." },
  ];

  const [changingPin, setChangingPin] = useState(false);
  async function changePin(pin: string) {
    const res = await fetch("/api/auth/pin/change", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin }),
    }).catch(() => null);
    if (res?.ok) {
      setChangingPin(false);
      toast("New PIN saved 🔑");
      return null;
    }
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? "Couldn't reach the server. Try again?";
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
        <h2>You</h2>
        <MyPhoto />
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
                <span className="small muted">Lets Us ping this phone at all.</span>
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
        <div className="stack" style={{ borderTop: "1.5px dashed var(--line)", paddingTop: 12, gap: 10 }}>
          <span className="small muted">What gets to ping you:</span>
          {prefs.map((p) => (
            <div key={p.key} className="toggle-row">
              <span>
                <strong>{p.label}</strong>
                <br />
                <span className="small muted">{p.hint}</span>
              </span>
              <label className="switch">
                <input type="checkbox" checked={me?.[p.key] ?? false} onChange={(e) => setPref(p.key, e.target.checked)} />
                <span />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="card stack" style={{ marginTop: 16 }}>
        <h2>Look</h2>
        <p className="small muted">Peach has green accents; Sage has pink ones. Just for this phone.</p>
        <ThemePicker />
      </section>

      <section className="card stack" style={{ marginTop: 16 }}>
        <h2>The dogs</h2>
        <p className="small muted">Tap a dog to set their photo. Dog notes post as them.</p>
        <DogPhotos />
      </section>

      <section className="card stack" style={{ marginTop: 16 }}>
        <h2>Your PIN</h2>
        {changingPin ? (
          <>
            <p className="muted" style={{ textAlign: "center" }}>
              Tap a new 4-digit PIN.
            </p>
            <PinPad onComplete={changePin} />
            <button className="btn btn-ghost btn-sm" onClick={() => setChangingPin(false)}>
              Never mind
            </button>
          </>
        ) : (
          <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setChangingPin(true)}>
            Change PIN
          </button>
        )}
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
