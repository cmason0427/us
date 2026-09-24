import "server-only";
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PIN_RE = /^\d{4}$/;

/**
 * Peppered digest of a PIN. Used both to look the user up and as their actual
 * Supabase password, so knowing a PIN doesn't let anyone skip our lockout and
 * guess against Supabase directly.
 */
export function pinDigest(pin: string) {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper) throw new Error("PIN_PEPPER is not set");
  return createHmac("sha256", pepper).update(`us-pin:${pin}`).digest("hex");
}

// A 4-digit PIN is only as good as its lockout. Global (not per person, since
// the PIN alone says who you are), shared by sign-in and the Spicy unlock: at
// most 20 wrong guesses a day, which puts brute-forcing at months, not minutes.
const SHORT_WINDOW_MS = 15 * 60 * 1000;
const SHORT_MAX_FAILS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_MAX_FAILS = 20;
export const LOCKED_OUT_MESSAGE = "Too many wrong tries. Take a breather and try again later.";

/** True if too many wrong PINs lately. `admin` must be the service-role client. */
export async function pinLockedOut(admin: SupabaseClient) {
  const now = Date.now();
  const fails = async (sinceMs: number) => {
    const { count } = await admin
      .from("pin_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ok", false)
      .gte("created_at", new Date(now - sinceMs).toISOString());
    return count ?? 0;
  };
  return (await fails(SHORT_WINDOW_MS)) >= SHORT_MAX_FAILS || (await fails(DAY_MS)) >= DAY_MAX_FAILS;
}

export async function recordPinAttempt(admin: SupabaseClient, ok: boolean) {
  await admin.from("pin_attempts").insert({ ok });
  // Housekeeping: nothing older than the day window matters.
  if (ok) await admin.from("pin_attempts").delete().lt("created_at", new Date(Date.now() - 2 * DAY_MS).toISOString());
}
