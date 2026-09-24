"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PinPad } from "@/components/PinPad";
import { markUnlocked } from "@/lib/lock";

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Match the phone's status bar to the fridge while this screen is up.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const prev = meta?.getAttribute("content");
    meta?.setAttribute("content", "#69190d");
    return () => {
      if (prev) meta?.setAttribute("content", prev);
    };
  }, []);

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
      markUnlocked();
      // Only same-site paths, so ?next= can't send anyone elsewhere.
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
      return null;
    }
    setBusy(false);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? "Couldn't reach the server. Try again?";
  }

  return (
    <main className="login with-cover">
      {/* The fridge photo exactly as it is: no crop, no filter. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="login-cover" src="/preview.jpg" alt="Fridge magnets: no matter how hard it gets, i always want it to be you" />
      <PinPad onComplete={signIn} busy={busy} />
    </main>
  );
}
