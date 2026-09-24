"use client";

import { useEffect, useState, type ReactNode } from "react";
import { refreshAll } from "@/lib/useLive";
import { PinPad } from "./PinPad";
import { DogPic } from "./DogPic";

/**
 * Spicy asks for your PIN every time it's opened. The server checks it, and
 * the database only returns Spicy things for a while after; leaving relocks.
 */
export function SpicyGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (!unlocked) return;
    return () => {
      fetch("/api/auth/pin/spicy", { method: "DELETE" }).catch(() => {});
    };
  }, [unlocked]);

  async function check(pin: string) {
    const res = await fetch("/api/auth/pin/spicy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin }),
    }).catch(() => null);
    if (res?.ok) {
      setUnlocked(true);
      refreshAll();
      return null;
    }
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? "Couldn't reach the server. Try again?";
  }

  if (unlocked) return <>{children}</>;
  return (
    <div className="card" style={{ textAlign: "center", marginTop: 12 }}>
      <DogPic name="kodo_wiley_cuddle" size={90} style={{ margin: "0 auto" }} />
      <h2>Spicy</h2>
      <p className="small muted">Enter your PIN to open.</p>
      <PinPad onComplete={check} />
    </div>
  );
}
