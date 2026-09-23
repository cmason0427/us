"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Flower, Mushroom, Wavy } from "@/components/Art";

/**
 * Landing page for invite and password-reset emails. Signs you in from the
 * link, then has you pick a password — passwords (not magic links) are what
 * work inside the installed home-screen app on iPhone.
 */
export default function WelcomePage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "yes" | "no">("checking");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    (async () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const code = new URLSearchParams(window.location.search).get("code");
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
      } else if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }
      window.history.replaceState(null, "", "/welcome");
      const { data } = await supabase.auth.getUser();
      setReady(data.user ? "yes" : "no");
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setMsg("At least 8 characters, please.");
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    if (error) {
      setMsg(error.message);
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="login">
      <div className="card card-stitched login-card">
        <div className="row" style={{ justifyContent: "center" }}>
          <Flower width={44} height={44} />
          <Mushroom width={44} height={44} />
          <Flower width={44} height={44} petal="#f3cf6b" />
        </div>
        <h1>Welcome</h1>
        <p className="muted">to our little corner</p>
        <Wavy />
        {ready === "checking" && <p className="muted">One sec…</p>}
        {ready === "no" && (
          <div className="stack">
            <p>That link expired or was already used.</p>
            <a className="btn btn-primary btn-block" href="/login">
              Back to sign in
            </a>
          </div>
        )}
        {ready === "yes" && (
          <form className="stack" onSubmit={submit} style={{ textAlign: "left" }}>
            <label className="field">
              <span>Pick a password</span>
              <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
            </label>
            {msg && <p className="error">{msg}</p>}
            <button className="btn btn-primary btn-block" disabled={busy}>
              Save &amp; come in
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
