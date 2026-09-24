"use client";

// PIN on every entry. "Unlocked" lives in sessionStorage, which dies when the
// app is closed, so a cold start always asks. Coming back from the background
// asks too, after a short grace period (quick app switches don't).
// Each unlock is a fresh sign-in, so a stale session can't strand anyone.

const KEY = "us:unlocked";
const HIDDEN_KEY = "us:hiddenAt";
export const LOCK_GRACE_MS = 60_000;

function store() {
  try {
    return window.sessionStorage;
  } catch {
    return null; // storage blocked: treat as locked every time
  }
}

export const isUnlocked = () => store()?.getItem(KEY) === "1";
export const markUnlocked = () => store()?.setItem(KEY, "1");
export const markHidden = () => store()?.setItem(HIDDEN_KEY, String(Date.now()));

/** True if the app was away long enough to need the PIN again. */
export function awayTooLong() {
  const at = Number(store()?.getItem(HIDDEN_KEY) ?? 0);
  return at > 0 && Date.now() - at > LOCK_GRACE_MS;
}

export function lockAndGoToLogin() {
  store()?.removeItem(KEY);
  store()?.removeItem(HIDDEN_KEY);
  const next = window.location.pathname + window.location.search;
  window.location.replace(`/login${next && next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`);
}
