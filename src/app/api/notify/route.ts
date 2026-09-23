import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { partnerOf, sendPushToUser } from "@/lib/push";
import { formatWhen } from "@/lib/format";

type Body =
  | { kind: "ask"; id: string }
  | { kind: "ask_answered"; id: string }
  | { kind: "post"; id: string }
  | { kind: "energy_request" }
  | { kind: "test" };

/**
 * Event-triggered pushes. The client calls this right after it writes
 * something; we re-read the row as that user (RLS) so nobody can make the
 * server push arbitrary text, then push the partner with the service key.
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user;
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  const partner = await partnerOf(me.id);
  const { data: myProfile } = await supabase.from("profiles").select("display_name").eq("id", me.id).single();
  const myName = myProfile?.display_name ?? "Your person";

  if (body.kind === "test") {
    const sent = await sendPushToUser(me.id, { title: "🍄 Hi from Us", body: "Notifications are working on this device.", url: "/settings", tag: "test" });
    return NextResponse.json({ sent });
  }
  if (!partner) return NextResponse.json({ sent: 0 });

  if (body.kind === "ask") {
    const { data: ev } = await supabase.from("events").select("*").eq("id", body.id).single();
    if (!ev || ev.created_by !== me.id || ev.type !== "ask" || ev.response_status !== "pending") {
      return NextResponse.json({ error: "not an open ask" }, { status: 400 });
    }
    const sent = await sendPushToUser(partner.id, {
      title: `${myName} is asking 💌`,
      body: `${ev.title} — ${formatWhen(ev.start_time, ev.all_day, partner.timezone)}. Can you make it?`,
      url: `/calendar?event=${ev.id}`,
      tag: `ask-${ev.id}`,
    });
    return NextResponse.json({ sent });
  }

  if (body.kind === "ask_answered") {
    const { data: ev } = await supabase.from("events").select("*").eq("id", body.id).single();
    if (!ev || ev.created_by === me.id || ev.type !== "ask" || ev.response_status === "pending") {
      return NextResponse.json({ error: "not an answered ask" }, { status: 400 });
    }
    const yes = ev.response_status === "accepted";
    const sent = await sendPushToUser(ev.created_by, {
      title: yes ? `${myName} is in 🎉` : `${myName} can't make it`,
      body: yes ? `${ev.title} is on for both of you.` : `${ev.title} stays on your calendar as a solo plan.`,
      url: `/calendar?event=${ev.id}`,
      tag: `ask-${ev.id}`,
    });
    return NextResponse.json({ sent });
  }

  if (body.kind === "post") {
    const { data: post } = await supabase.from("posts").select("id, author").eq("id", body.id).single();
    if (!post || post.author !== me.id) return NextResponse.json({ error: "not your post" }, { status: 400 });
    // Read the partner's preference directly: this nudge is opt-in, off by default.
    const { data: pref } = await supabase.from("profiles").select("notify_partner_posts").eq("id", partner.id).single();
    if (!pref?.notify_partner_posts) return NextResponse.json({ sent: 0 });
    const sent = await sendPushToUser(partner.id, {
      title: "🌼 A little update",
      body: `${myName} shared something. Whenever you get a sec.`,
      url: "/",
      tag: "feed", // collapses multiple posts into one quiet notification
    });
    return NextResponse.json({ sent });
  }

  if (body.kind === "energy_request") {
    const sent = await sendPushToUser(partner.id, {
      title: "🔋 Quick energy check?",
      body: `${myName} is looking for something to do. Tap to share your energy level.`,
      url: "/do",
      tag: "energy",
    });
    return NextResponse.json({ sent });
  }

  return NextResponse.json({ error: "unknown kind" }, { status: 400 });
}
