"use client";

/** Fire-and-forget: ask the server to push the partner about something we just did. */
export function notify(body: { kind: "ask" | "ask_answered" | "post" | "lunch" | "vibe" | "spicy" | "star" | "spicy_item" | "plan" | "deck"; id: string } | { kind: "energy_request" | "test" | "status" }) {
  return fetch("/api/notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
    .then((r) => r.json() as Promise<{ sent?: number; error?: string }>)
    .catch(() => ({ sent: 0 }));
}
