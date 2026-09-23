import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Save this device's push subscription for the signed-in user. */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { subscription } = await req.json();
  if (!subscription?.endpoint) return NextResponse.json({ error: "bad subscription" }, { status: 400 });

  // An endpoint is one browser on one device. If the other account used this
  // device before, RLS hides their row from us, so clear it with the admin key.
  await supabaseAdmin().from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  const { error } = await supabase
    .from("push_subscriptions")
    .insert({ user_id: auth.user.id, endpoint: subscription.endpoint, subscription_json: subscription });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Forget this device. */
export async function DELETE(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { endpoint } = await req.json();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
