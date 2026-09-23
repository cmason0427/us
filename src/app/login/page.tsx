"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Flower, Mushroom, Wavy } from "@/components/Art";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "link">("password");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = supabaseBrowser();
    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setMsg(error.message);
        setBusy(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        // Never create accounts from the login screen — there are exactly two.
        options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setMsg(error ? error.message : "Check your email for the link 💌");
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="card card-stitched login-card">
        <div className="row" style={{ justifyContent: "center" }}>
          <Flower width={44} height={44} />
          <Mushroom width={44} height={44} />
          <Flower width={44} height={44} petal="#f3cf6b" />
        </div>
        <h1>Us</h1>
        <p className="muted">our little corner</p>
        <Wavy />
        <form className="stack" onSubmit={submit} style={{ textAlign: "left" }}>
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {mode === "password" && (
            <label className="field">
              <span>Password</span>
              <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          )}
          {msg && <p className={msg.startsWith("Check") ? "muted" : "error"}>{msg}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {mode === "password" ? "Come on in" : "Email me a link"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode(mode === "password" ? "link" : "password")}>
            {mode === "password" ? "Use a magic link instead" : "Use a password instead"}
          </button>
        </form>
      </div>
    </main>
  );
}
