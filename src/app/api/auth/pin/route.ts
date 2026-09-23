import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PIN_RE, pinDigest } from "@/lib/pin";

// A 4-digit PIN is only as good as its lockout. These are global (not per
// IP or per person, since the PIN alone says who you are): at most 20 wrong
// guesses a day, which puts brute-forcing either PIN at months, not minutes.
const SHORT_WINDOW_MS = 15 * 60 * 1000;
const SHORT_MAX_FAILS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_MAX_FAILS = 20;

/** Sign in with a PIN. Sets the Supabase session cookie on success. */
export async function POST(req: Request) {
  const admin = supabaseAdmin();
  const now = Date.now();

  const fails = async (sinceMs: number) => {
    const { count } = await admin
      .from("pin_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ok", false)
      .gte("created_at", new Date(now - sinceMs).toISOString());
    return count ?? 0;
  };
  if ((await fails(SHORT_WINDOW_MS)) >= SHORT_MAX_FAILS || (await fails(DAY_MS)) >= DAY_MAX_FAILS) {
    return NextResponse.json({ error: "Too many wrong tries. Take a breather and try again later." }, { status: 429 });
  }

  const { pin } = (await req.json().catch(() => ({}))) as { pin?: string };
  if (typeof pin !== "string" || !PIN_RE.test(pin)) {
    return NextResponse.json({ error: "PINs are 4 digits." }, { status: 400 });
  }

  const digest = pinDigest(pin);
  const fail = async () => {
    await admin.from("pin_attempts").insert({ ok: false });
    return NextResponse.json({ error: "Nope, that's not it." }, { status: 401 });
  };

  const { data: row } = await admin.from("pin_logins").select("user_id").eq("pin_hmac", digest).maybeSingle();
  if (!row) return fail();
  const { data: user } = await admin.auth.admin.getUserById(row.user_id);
  if (!user.user?.email) return fail();

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email: user.user.email, password: digest });
  if (error) return fail();

  await admin.from("pin_attempts").insert({ ok: true });
  // Housekeeping: nothing older than the day window matters.
  await admin.from("pin_attempts").delete().lt("created_at", new Date(now - 2 * DAY_MS).toISOString());
  return NextResponse.json({ ok: true });
}
