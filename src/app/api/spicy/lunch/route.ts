import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { partnerOf, sendPushToUser } from "@/lib/push";

type Body = { action: "send" } | { action: "answer"; id: string; yes: boolean };

/**
 * "Lunch: you? 😏". Sending drops a card in the feed for the other person.
 * They answer "bon appétit" (the card says so) or "not on the menu", which
 * removes it from both feeds and quietly lets the sender know.
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user;
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as Body;
  const admin = supabaseAdmin();
  const partner = await partnerOf(me.id);
  if (!partner) return NextResponse.json({ error: "no partner" }, { status: 400 });
  const { data: myProfile } = await admin.from("profiles").select("display_name").eq("id", me.id).single();
  const myName = myProfile?.display_name ?? "Your person";

  if (body.action === "send") {
    const { data, error } = await admin
      .from("posts")
      .insert({ author: me.id, kind: "lunch_you", to_user: partner.id, text: "Lunch: you? 😏" })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await sendPushToUser(partner.id, { title: "🌶️", body: `${myName}: Lunch: you? 😏`, url: "/", tag: `lunchyou-${data.id}` });
    return NextResponse.json({ ok: true });
  }

  const { data: post } = await admin.from("posts").select("id, author, to_user, kind, reply").eq("id", body.id).single();
  if (!post || post.kind !== "lunch_you" || post.to_user !== me.id) return NextResponse.json({ error: "not yours to answer" }, { status: 400 });
  if (body.yes) {
    await admin.from("posts").update({ reply: "yes" }).eq("id", post.id);
    await sendPushToUser(post.author, { title: "🌶️", body: `${myName}: Bon appétit 😋`, url: "/", tag: `lunchyou-${post.id}` });
  } else {
    await admin.from("posts").delete().eq("id", post.id);
    await sendPushToUser(post.author, { title: "💛", body: `${myName} isn't hungry right now. No worries.`, url: "/", tag: `lunchyou-${post.id}` });
  }
  return NextResponse.json({ ok: true });
}
