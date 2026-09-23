import "server-only";
import { createHmac } from "node:crypto";

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
