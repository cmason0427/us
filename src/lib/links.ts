"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

// Links to things in the app. In text they're written as `[label](/path)`, a
// chip that takes you there, or `![label](/path)`, an embed that shows the
// thing right there (type \ in a text box to pick one); a copied link is the
// full URL, which is recognised too. Only things that are there for both of you are linkable:
// pages and their tabs, updates in the feed, boards and what's on them, and
// calendar plans. Gone (deleted, declined, unshared) things show as "not here".

export type Dest = { path: string; label: string; emoji: string };

/** Every page, and every tab inside one, that can be linked. */
export const PLACES: Dest[] = [
  { path: "/", label: "Home", emoji: "🏠" },
  { path: "/calendar", label: "Calendar", emoji: "📅" },
  { path: "/calendar?view=day", label: "Calendar · Day", emoji: "📅" },
  { path: "/calendar?view=week", label: "Calendar · Week", emoji: "📅" },
  { path: "/calendar?view=month", label: "Calendar · Month", emoji: "📅" },
  { path: "/lists", label: "To-dos", emoji: "✅" },
  { path: "/shopping", label: "Shopping", emoji: "🛒" },
  { path: "/eat", label: "Food · Pick food", emoji: "🍽️" },
  { path: "/eat?tab=lunches", label: "Food · Lunches", emoji: "🥪" },
  { path: "/eat?tab=pantry", label: "Food · Pantry", emoji: "🥫" },
  { path: "/eat?tab=groceries", label: "Food · Groceries", emoji: "🧺" },
  { path: "/fit", label: "Fuel & move", emoji: "💪" },
  { path: "/water", label: "Water", emoji: "💧" },
  { path: "/money", label: "My money", emoji: "👛" },
  { path: "/little?about=us", label: "Little things · Us", emoji: "💞" },
  { path: "/dogs", label: "Dogs", emoji: "🐾" },
  { path: "/dogs?dog=kodo", label: "Dogs · Kodo", emoji: "🐶" },
  { path: "/dogs?dog=wiley", label: "Dogs · Wiley", emoji: "🐶" },
  { path: "/pup", label: "Pup parenting · Sessions", emoji: "📋" },
  { path: "/pup?tab=rules", label: "Pup parenting · Rules", emoji: "📏" },
  { path: "/pup?tab=collar", label: "Pup parenting · Collar", emoji: "📟" },
  { path: "/pup?tab=map", label: "Pup parenting · Training", emoji: "🌳" },
  { path: "/pup?tab=notes", label: "Pup parenting · Notes", emoji: "📝" },
  { path: "/do", label: "Do something", emoji: "✨" },
  { path: "/goals", label: "Goals · Mine", emoji: "🎯" },
  { path: "/goals?tab=ours", label: "Goals · Ours", emoji: "🎯" },
  { path: "/nerd", label: "Nerd dungeon · Decks", emoji: "🃏" },
  { path: "/nerd?tab=theater", label: "Nerd dungeon · Theater", emoji: "🎬" },
  { path: "/garden", label: "Garden", emoji: "🌿" },
  { path: "/spicy", label: "Spicy · Pics", emoji: "🌶️" },
  { path: "/spicy?tab=ideas", label: "Spicy · Ideas", emoji: "🌶️" },
  { path: "/spicy?tab=notes", label: "Spicy · Notes", emoji: "🌶️" },
  { path: "/saved", label: "Saved", emoji: "🔖" },
  { path: "/occasions", label: "Dates & people", emoji: "🎂" },
  { path: "/places", label: "Places", emoji: "📍" },
  { path: "/presets", label: "Presets", emoji: "📌" },
  { path: "/settings", label: "Settings", emoji: "⚙️" },
];

/** `[label](/path)` (or `![label](/path)` to embed) in text. */
export const TOKEN = /(!?)\[([^\]\n]{1,80})\]\((\/[^)\s]*)\)/g;
export const token = (label: string, path: string, embed = false) => `${embed ? "!" : ""}[${label.replace(/[[\]]/g, "")}](${path})`;

/** A full copied link to this app, as an in-app path (or null). */
export function appPath(url: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const u = new URL(url);
    return u.origin === window.location.origin ? u.pathname + u.search : null;
  } catch {
    return null;
  }
}

/** What kind of thing a path points at. */
export type Target =
  | { kind: "place"; dest: Dest | null }
  | { kind: "post"; id: string }
  | { kind: "board"; id: string; item: string | null }
  | { kind: "event"; id: string };
export function targetOf(path: string): Target {
  const [p, q = ""] = path.split("?");
  const qs = new URLSearchParams(q);
  const post = /^\/posts\/([\w-]+)$/.exec(p);
  if (post) return { kind: "post", id: post[1] };
  const board = /^\/threads\/([\w-]+)$/.exec(p);
  if (board) return { kind: "board", id: board[1], item: qs.get("item") };
  if (p === "/calendar" && qs.get("event")) return { kind: "event", id: qs.get("event")! };
  return { kind: "place", dest: PLACES.find((d) => d.path === path) ?? PLACES.find((d) => d.path === p) ?? null };
}

export async function copyLink(path: string, toast: (m: string) => void) {
  const url = `${window.location.origin}${path}`;
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied 🔗 paste it anywhere in the app");
  } catch {
    window.prompt("Copy this link", url);
  }
}

/**
 * A tab that lives in the URL (`?tab=…`), so the page can be linked straight
 * to it. Switching tabs updates the address quietly (no reload).
 */
export function useUrlTab<T extends string>(allowed: readonly T[], fallback: T, key = "tab"): [T, (v: T) => void] {
  const wanted = useSearchParams().get(key);
  const [v, setV] = useState<T>(allowed.includes(wanted as T) ? (wanted as T) : fallback);
  const set = (x: T) => {
    setV(x);
    const u = new URL(window.location.href);
    if (x === fallback) u.searchParams.delete(key);
    else u.searchParams.set(key, x);
    window.history.replaceState(null, "", u.pathname + u.search);
  };
  return [v, set];
}
