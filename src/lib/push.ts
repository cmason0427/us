import "server-only";
import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface PushPayload {
  title: string;
  body: string;
  /** Path to open when the notification is tapped. */
  url?: string;
  /** Notifications with the same tag replace each other instead of stacking. */
  tag?: string;
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:hello@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

/** Sends to every device the user has subscribed. Dead subscriptions get pruned. */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  configure();
  const admin = supabaseAdmin();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, subscription_json")
    .eq("user_id", userId);

  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(s.subscription_json, JSON.stringify(payload), { TTL: 60 * 60 * 12 });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          console.error("push failed", status, err);
        }
      }
    }),
  );
  return sent;
}

/** The other account. There are exactly two. */
export async function partnerOf(
  userId: string,
): Promise<{ id: string; display_name: string; timezone: string; notify_asks: boolean; notify_energy: boolean; notify_partner_posts: boolean } | null> {
  const { data } = await supabaseAdmin()
    .from("profiles")
    .select("id, display_name, timezone, notify_asks, notify_energy, notify_partner_posts")
    .neq("id", userId)
    .limit(1)
    .maybeSingle();
  return data;
}
