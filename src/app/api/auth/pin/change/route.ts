import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PIN_RE, pinDigest } from "@/lib/pin";

/** Change the signed-in person's PIN (which also rotates their Supabase password). */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user;
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { pin } = (await req.json().catch(() => ({}))) as { pin?: string };
  if (typeof pin !== "string" || !PIN_RE.test(pin)) {
    return NextResponse.json({ error: "PINs are 4 digits." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const digest = pinDigest(pin);
  const { data: taken } = await admin.from("pin_logins").select("user_id").eq("pin_hmac", digest).maybeSingle();
  if (taken && taken.user_id !== me.id) {
    // The PIN alone picks the account, so the two can't match.
    return NextResponse.json({ error: "Pick a different PIN." }, { status: 409 });
  }

  // Claim the PIN first (the unique index settles races), then rotate the
  // password; put the old PIN back if that fails so you're never locked out.
  const { data: old } = await admin.from("pin_logins").select("pin_hmac").eq("user_id", me.id).maybeSingle();
  const { error } = await admin.from("pin_logins").upsert({ user_id: me.id, pin_hmac: digest });
  if (error) return NextResponse.json({ error: "Pick a different PIN." }, { status: 409 });
  const { error: pwError } = await admin.auth.admin.updateUserById(me.id, { password: digest });
  if (pwError) {
    if (old) await admin.from("pin_logins").update({ pin_hmac: old.pin_hmac }).eq("user_id", me.id);
    return NextResponse.json({ error: pwError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
