import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { formatWhen } from "@/lib/format";
import { effectiveType } from "@/lib/types";
import { dogVoice } from "@/lib/dogs";

// Don't fire reminders for things that already started this long ago
// (e.g. the cron was down for a while). All-day events get the whole day.
const STALE_TIMED_MS = 60 * 60 * 1000;
const STALE_ALL_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sends due event reminders. Called by Vercel Cron and/or Supabase pg_cron
 * with `Authorization: Bearer $CRON_SECRET`. Idempotent: each event is
 * claimed by stamping reminder_sent_at before sending.
 */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = supabaseAdmin();
  const now = Date.now();

  // Coarse window from the DB (lead can be up to ~a week), exact check below.
  const { data: candidates, error } = await admin
    .from("events")
    .select("*")
    .not("reminder_lead_minutes", "is", null)
    .is("reminder_sent_at", null)
    .gte("start_time", new Date(now - STALE_ALL_DAY_MS).toISOString())
    .lte("start_time", new Date(now + 8 * 24 * 60 * 60 * 1000).toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: profiles } = await admin.from("profiles").select("id, timezone, notify_reminders");
  const tzOf = new Map((profiles ?? []).map((p) => [p.id, p.timezone as string]));
  const everyone = (profiles ?? []).map((p) => p.id as string);
  const wantsReminders = new Set((profiles ?? []).filter((p) => p.notify_reminders).map((p) => p.id as string));

  let sent = 0;
  for (const ev of candidates ?? []) {
    const start = new Date(ev.start_time).getTime();
    const fireAt = start - ev.reminder_lead_minutes * 60 * 1000;
    const staleAfter = start + (ev.all_day ? STALE_ALL_DAY_MS : STALE_TIMED_MS);
    if (fireAt > now || now > staleAfter) continue;

    // Claim it first so an overlapping run can't double-send.
    const { data: claimed } = await admin
      .from("events")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", ev.id)
      .is("reminder_sent_at", null)
      .select("id");
    if (!claimed?.length) continue;

    // Solo plans (incl. declined asks) only remind the person going.
    const type = effectiveType(ev);
    const recipients = type === "solo" ? [ev.created_by] : everyone;
    for (const uid of recipients) {
      if (!wantsReminders.has(uid)) continue;
      sent += await sendPushToUser(uid, {
        title: `⏰ ${ev.title}`,
        body: formatWhen(ev.start_time, ev.all_day, tzOf.get(uid) ?? "UTC") + (ev.location ? ` · ${ev.location}` : ""),
        url: `/calendar?event=${ev.id}`,
        tag: `reminder-${ev.id}`,
      });
    }
  }
  // Daily to-do presets with a ping time ("breakfast at 8:00"): once a day,
  // on time (not hours late if the cron was down), unless it's already done.
  let pinged = 0;
  const { data: pings } = await admin.from("task_templates").select("id, title, emoji, list_type, dogs, ping_at, pinged_on, created_by").eq("daily", true).not("ping_at", "is", null);
  for (const t of pings ?? []) {
    const tz = tzOf.get(t.created_by) ?? "UTC";
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now)).map((p) => [p.type, p.value]));
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    const mins = Number(parts.hour) * 60 + Number(parts.minute);
    const [ph, pm] = String(t.ping_at).split(":").map(Number);
    const late = mins - (ph * 60 + pm);
    if (late < 0 || late > 30 || t.pinged_on === today) continue;
    const { data: claimed } = await admin.from("task_templates").update({ pinged_on: today }).eq("id", t.id).or(`pinged_on.is.null,pinged_on.neq.${today}`).select("id");
    if (!claimed?.length) continue;
    const { data: doneToday } = await admin.from("tasks").select("id").eq("template_id", t.id).eq("for_day", today).eq("done", true).limit(1);
    if (doneToday?.length) continue;
    for (const uid of everyone) {
      if (!wantsReminders.has(uid)) continue;
      pinged += await sendPushToUser(uid, {
        title: `${t.emoji ?? "⏰"} ${t.title}`,
        body: t.list_type === "dogs" && t.dogs?.length ? `For ${dogVoice(t.dogs)}.` : "Whenever you get a sec.",
        url: t.list_type === "dogs" ? "/dogs" : "/lists",
        tag: `ping-${t.id}`,
      });
    }
  }

  // Passed deadlines make a to-do urgent (the lists also sort them to the top).
  const { data: bumped } = await admin
    .from("tasks")
    .update({ urgency: "high" })
    .eq("done", false)
    .neq("urgency", "high")
    .lt("due_at", new Date(now).toISOString())
    .select("id");

  return NextResponse.json({ checked: candidates?.length ?? 0, sent, pinged, overdueBumped: bumped?.length ?? 0 });
}
