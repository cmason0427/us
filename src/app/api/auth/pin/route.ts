import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LOCKED_OUT_MESSAGE, PIN_RE, pinDigest, pinLockedOut, recordPinAttempt } from "@/lib/pin";

/** Sign in with a PIN. Sets the Supabase session cookie on success. */
export async function POST(req: Request) {
  // Say which setup piece is missing instead of crashing into a bare 500.
  const missing = ["SUPABASE_SERVICE_ROLE_KEY", "PIN_PEPPER"].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error("PIN sign-in is missing env vars:", missing.join(", "));
    return NextResponse.json({ error: `The site is missing ${missing.join(" and ")}.` }, { status: 500 });
  }
  try {
    return await signIn(req);
  } catch (err) {
    console.error("PIN sign-in failed", err);
    return NextResponse.json({ error: "Something broke on our end. Try again in a sec." }, { status: 500 });
  }
}

async function signIn(req: Request) {
  const admin = supabaseAdmin();
  if (await pinLockedOut(admin)) return NextResponse.json({ error: LOCKED_OUT_MESSAGE }, { status: 429 });

  const { pin } = (await req.json().catch(() => ({}))) as { pin?: string };
  if (typeof pin !== "string" || !PIN_RE.test(pin)) {
    return NextResponse.json({ error: "PINs are 4 digits." }, { status: 400 });
  }

  const digest = pinDigest(pin);
  const fail = async () => {
    await recordPinAttempt(admin, false);
    return NextResponse.json({ error: "Nope, that's not it." }, { status: 401 });
  };

  const { data: row } = await admin.from("pin_logins").select("user_id").eq("pin_hmac", digest).maybeSingle();
  if (!row) return fail();
  const { data: user } = await admin.auth.admin.getUserById(row.user_id);
  if (!user.user?.email) return fail();

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email: user.user.email, password: digest });
  if (error) return fail();

  await recordPinAttempt(admin, true);
  return NextResponse.json({ ok: true });
}
