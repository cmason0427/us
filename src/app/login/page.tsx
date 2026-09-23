"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flower, Mushroom, Wavy } from "@/components/Art";
import { PinPad } from "@/components/PinPad";

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signIn(pin: string) {
    setBusy(true);
    // Retry when the host drops the request before our code runs (a bare,
    // non-JSON 5xx or a network error). Real answers are JSON and aren't retried.
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      }).catch(() => null);
      const hostHiccup = !res || (res.status >= 500 && !res.headers.get("content-type")?.includes("json"));
      if (!hostHiccup) break;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    if (res?.ok) {
      router.replace("/");
      router.refresh();
      return null;
    }
    setBusy(false);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? "Couldn't reach the server. Try again?";
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
        <PinPad onComplete={signIn} busy={busy} />
      </div>
    </main>
  );
}
