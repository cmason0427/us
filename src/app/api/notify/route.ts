import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { partnerOf, sendPushToUser } from "@/lib/push";
import { formatWhen } from "@/lib/format";
import { dogName, dogVoice } from "@/lib/dogs";
import { describeFilters } from "@/lib/food";
import type { LunchMsg } from "@/lib/lunch";

type Body =
  | { kind: "ask"; id: string }
  | { kind: "ask_answered"; id: string }
  | { kind: "post"; id: string }
  | { kind: "lunch"; id: string }
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
    if (!partner.notify_asks) return NextResponse.json({ sent: 0 });
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
    // Answers only ever go back to the asker, who is the partner here.
    if (!partner.notify_asks) return NextResponse.json({ sent: 0 });
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
    const { data: post } = await supabase.from("posts").select("id, author, text, dogs, as_dog").eq("id", body.id).single();
    if (!post || post.author !== me.id) return NextResponse.json({ error: "not your post" }, { status: 400 });
    // This nudge is opt-in, off by default.
    if (!partner.notify_partner_posts) return NextResponse.json({ sent: 0 });
    // Dog notes say what happened; a vague ping about the dogs isn't useful.
    const dogs = (post.dogs as string[]).map(dogName).join(" & ");
    // A dog note speaks as the dog: "🐾 Kodo — had a runny poop".
    const voice = post.as_dog && dogs ? dogVoice(post.dogs as string[]) : null;
    const sent = await sendPushToUser(partner.id, {
      title: voice ? `🐾 ${voice}` : dogs ? `🐾 ${dogs}` : "🌼 A little update",
      body: voice && post.text ? post.text : dogs && post.text ? `${myName}: ${post.text}` : `${myName} shared something. Whenever you get a sec.`,
      url: dogs ? "/lists?tab=dogs" : "/",
      tag: dogs ? `dogs-${post.id}` : "feed", // plain updates collapse into one quiet notification
    });
    return NextResponse.json({ sent });
  }

  if (body.kind === "lunch") {
    const { data: msg } = await supabase.from("lunch_msgs").select("*").eq("id", body.id).single<LunchMsg>();
    if (!msg || msg.author !== me.id) return NextResponse.json({ error: "not your lunch message" }, { status: 400 });
    // Lunch back-and-forth is a direct question, so it follows the asks setting.
    if (!partner.notify_asks) return NextResponse.json({ sent: 0 });
    const ids = (k: string) => msg.refs.filter((r) => r.kind === k).map((r) => r.id);
    const [{ data: ps }, { data: ms }] = await Promise.all([
      ids("place").length ? supabase.from("food_places").select("id, name").in("id", ids("place")) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ids("meal").length ? supabase.from("home_meals").select("id, name").in("id", ids("meal")) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const names = new Map([...(ps ?? []), ...(ms ?? [])].map((x) => [x.id, x.name]));
    const list = msg.refs.map((r) => names.get(r.id) ?? "something").join(", ");
    const text = {
      propose: `${myName} suggests ${list}. Sound good?`,
      filters: `${myName} is feeling: ${msg.filters ? describeFilters(msg.filters) : "anything"}. Pick something?`,
      request: `${myName} wants some lunch options.`,
      options: `${myName} sent options: ${list}. Pick one?`,
      decided: `Lunch: ${list} ✅`,
    }[msg.kind];
    const sent = await sendPushToUser(partner.id, { title: "🍽️ Lunch", body: text, url: "/", tag: `lunch-${msg.day}` });
    return NextResponse.json({ sent });
  }

  if (body.kind === "energy_request") {
    if (!partner.notify_energy) return NextResponse.json({ sent: 0 });
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
