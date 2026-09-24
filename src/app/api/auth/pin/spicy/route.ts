import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LOCKED_OUT_MESSAGE, PIN_RE, pinDigest, pinLockedOut, recordPinAttempt } from "@/lib/pin";

// How long one PIN entry keeps Spicy readable (the database checks this).
// Leaving the Spicy tab or folder relocks right away.
const UNLOCK_MS = 30 * 60 * 1000;

/** Re-enter your own PIN to open Spicy. Same lockout as sign-in. */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user;
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();
  if (await pinLockedOut(admin)) return NextResponse.json({ error: LOCKED_OUT_MESSAGE }, { status: 429 });

  const { pin } = (await req.json().catch(() => ({}))) as { pin?: string };
  if (typeof pin !== "string" || !PIN_RE.test(pin)) return NextResponse.json({ error: "PINs are 4 digits." }, { status: 400 });

  // It has to be *your* PIN, not just a valid one.
  const { data: row } = await admin.from("pin_logins").select("user_id").eq("pin_hmac", pinDigest(pin)).maybeSingle();
  if (row?.user_id !== me.id) {
    await recordPinAttempt(admin, false);
    return NextResponse.json({ error: "Nope, that's not it." }, { status: 401 });
  }
  await recordPinAttempt(admin, true);
  const { error } = await admin.from("spicy_unlocks").upsert({ user_id: me.id, until: new Date(Date.now() + UNLOCK_MS).toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Lock it again right away (leaving the folder). */
export async function DELETE() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await supabaseAdmin().from("spicy_unlocks").delete().eq("user_id", auth.user.id);
  return NextResponse.json({ ok: true });
}
