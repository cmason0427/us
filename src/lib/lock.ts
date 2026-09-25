"use client";

// The PIN is only asked for when the sign-in has actually stopped working
// (the server layout redirects to /login, or AppProvider sees the session
// die). These helpers are what's left of the old "PIN on every entry" lock.

const KEY = "us:unlocked";

function store() {
  try {
    return window.sessionStorage;
  } catch {
    return null; // storage blocked: treat as locked every time
  }
}

export const markUnlocked = () => store()?.setItem(KEY, "1");

export function lockAndGoToLogin() {
  store()?.removeItem(KEY);
  const next = window.location.pathname + window.location.search;
  window.location.replace(`/login${next && next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`);
}
