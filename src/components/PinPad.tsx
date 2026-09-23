"use client";

import { useEffect, useState } from "react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

/**
 * Four dots and a phone-style keypad. Calls `onComplete` once four digits are
 * in; return a message to show (and clear the dots), or null on success.
 */
export function PinPad({ onComplete, busy }: { onComplete: (pin: string) => Promise<string | null>; busy?: boolean }) {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  function press(k: string) {
    if (busy) return;
    setMsg(null);
    if (k === "⌫") setPin((p) => p.slice(0, -1));
    else if (k) setPin((p) => (p.length < 4 ? p + k : p));
  }

  useEffect(() => {
    if (pin.length !== 4) return;
    let live = true;
    onComplete(pin).then((err) => {
      if (!live || !err) return;
      setMsg(err);
      setShake(true);
      setPin("");
      setTimeout(() => setShake(false), 400);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per completed PIN
  }, [pin]);

  // Hardware keyboards (and the laptop) work too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("⌫");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="pin">
      <div className={`pin-dots${shake ? " pin-shake" : ""}`} aria-label={`${pin.length} of 4 digits entered`} role="status">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i < pin.length ? "on" : ""} />
        ))}
      </div>
      <p className="error pin-msg">{msg ?? " "}</p>
      <div className="pin-keys">
        {KEYS.map((k, i) =>
          k ? (
            <button key={i} type="button" className="btn pin-key" onClick={() => press(k)} disabled={busy} aria-label={k === "⌫" ? "Delete" : k}>
              {k}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
    </div>
  );
}
