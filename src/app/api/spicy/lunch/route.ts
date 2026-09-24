import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { partnerOf, sendPushToUser } from "@/lib/push";

type Body = { action: "send"; text?: string } | { action: "answer"; id: string; yes: boolean };

const MAX_TEXT = 140;

/**
 * Mood asks: "Lunch: you? 😏", "In the mood. Are you?", or your own words.
 * Sending drops a card in the feed for the other person. "I'm in" stays on the
 * card; "not right now" takes it out of both feeds (kept as reply = 'no' so
 * the sender's "you asked a bit ago" check still counts it) and quietly lets
 * the sender know.
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
    const text = (body.text ?? "").trim().slice(0, MAX_TEXT) || "Lunch: you? 😏";
    const { data, error } = await admin
      .from("posts")
      .insert({ author: me.id, kind: "lunch_you", to_user: partner.id, text })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await sendPushToUser(partner.id, { title: "🌶️", body: `${myName}: ${text}`, url: "/", tag: `lunchyou-${data.id}` });
    return NextResponse.json({ ok: true });
  }

  const { data: post } = await admin.from("posts").select("id, author, to_user, kind, reply").eq("id", body.id).single();
  if (!post || post.kind !== "lunch_you" || post.to_user !== me.id) return NextResponse.json({ error: "not yours to answer" }, { status: 400 });
  if (body.yes) {
    await admin.from("posts").update({ reply: "yes" }).eq("id", post.id);
    await sendPushToUser(post.author, { title: "🌶️", body: `${myName}: I'm in 😏`, url: "/", tag: `lunchyou-${post.id}` });
  } else {
    await admin.from("posts").update({ reply: "no" }).eq("id", post.id);
    await sendPushToUser(post.author, { title: "💛", body: `${myName}: not right now. Another time 💛`, url: "/", tag: `lunchyou-${post.id}` });
  }
  return NextResponse.json({ ok: true });
}
