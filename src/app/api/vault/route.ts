import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { partnerOf, sendPushToUser } from "@/lib/push";
import { open, seal, type VaultSecret } from "@/lib/vault";

type Body =
  | { action: "save"; id?: string; name: string; kind: string; secret: VaultSecret }
  | { action: "reveal"; id: string }
  | { action: "delete"; id: string }
  | { action: "request"; id: string }
  | { action: "approve"; id: string }
  | { action: "decline"; id: string }
  | { action: "send"; id: string }
  | { action: "open"; id: string };

const KINDS = ["app", "device", "card", "other"];
const clip = (s: string | undefined, n: number) => (s ?? "").trim().slice(0, n);

/**
 * Keys: each person's own logins and PINs. The browser never sees ciphertext;
 * everything goes through here. Sharing is one-time: ask (or just send), the
 * owner approves, the other person taps the push and sees it once, then it's
 * wiped. Nothing ever goes in the feed.
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user;
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as Body;
  const admin = supabaseAdmin();
  const partner = await partnerOf(me.id);
  const { data: myProfile } = await admin.from("profiles").select("display_name").eq("id", me.id).single();
  const myName = myProfile?.display_name ?? "Your person";
  const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

  const mine = async (id: string) => {
    const { data } = await admin.from("vault_items").select("*").eq("id", id).single();
    return data && data.owner === me.id ? data : null;
  };

  if (body.action === "save") {
    const name = clip(body.name, 60);
    const password = clip(body.secret?.password, 500);
    if (!name || !password) return bad("A name and the password are both needed.");
    const row = {
      name,
      kind: KINDS.includes(body.kind) ? body.kind : "other",
      secret_enc: seal({ username: clip(body.secret.username, 200) || undefined, password, note: clip(body.secret.note, 500) || undefined }),
      updated_at: new Date().toISOString(),
    };
    if (body.id) {
      if (!(await mine(body.id))) return bad("not yours", 403);
      const { error } = await admin.from("vault_items").update(row).eq("id", body.id);
      if (error) return bad(error.code === "23505" ? `You already have a "${name}".` : error.message);
    } else {
      const { error } = await admin.from("vault_items").insert({ ...row, owner: me.id });
      if (error) return bad(error.code === "23505" ? `You already have a "${name}". Edit that one instead.` : error.message);
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reveal") {
    const item = await mine(body.id);
    if (!item) return bad("not yours", 403);
    return NextResponse.json({ secret: open(item.secret_enc) });
  }

  if (body.action === "delete") {
    if (!(await mine(body.id))) return bad("not yours", 403);
    await admin.from("vault_items").delete().eq("id", body.id);
    return NextResponse.json({ ok: true });
  }

  if (!partner) return bad("no partner");

  if (body.action === "request") {
    const { data: item } = await admin.from("vault_items").select("id, name, owner").eq("id", body.id).single();
    if (!item || item.owner !== partner.id) return bad("not theirs");
    // One open ask per key is plenty.
    const { data: open_ } = await admin.from("vault_shares").select("id").eq("item_id", item.id).eq("recipient", me.id).eq("status", "requested").maybeSingle();
    if (open_) return NextResponse.json({ ok: true, already: true });
    const { data: share } = await admin
      .from("vault_shares")
      .insert({ item_id: item.id, item_name: item.name, owner: partner.id, recipient: me.id, status: "requested" })
      .select("id")
      .single();
    await sendPushToUser(partner.id, { title: `🔑 ${myName} needs a login`, body: `${item.name}. Tap to share it (or not).`, url: `/keys?share=${share!.id}`, tag: `vault-${share!.id}` });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "approve" || body.action === "decline") {
    const { data: share } = await admin.from("vault_shares").select("*").eq("id", body.id).single();
    if (!share || share.owner !== me.id || share.status !== "requested") return bad("nothing to answer");
    if (body.action === "decline") {
      // Quietly: the ask just goes away on their side.
      await admin.from("vault_shares").update({ status: "declined", resolved_at: new Date().toISOString() }).eq("id", share.id);
      return NextResponse.json({ ok: true });
    }
    const item = share.item_id ? await mine(share.item_id) : null;
    if (!item) return bad("that key is gone");
    await admin.from("vault_shares").update({ status: "sent", payload_enc: item.secret_enc, resolved_at: new Date().toISOString() }).eq("id", share.id);
    await sendPushToUser(share.recipient, { title: `🔑 ${myName} shared ${item.name}`, body: "Tap to see it. It shows once.", url: `/keys?share=${share.id}`, tag: `vault-${share.id}` });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "send") {
    const item = await mine(body.id);
    if (!item) return bad("not yours", 403);
    const { data: share } = await admin
      .from("vault_shares")
      .insert({ item_id: item.id, item_name: item.name, owner: me.id, recipient: partner.id, status: "sent", payload_enc: item.secret_enc, resolved_at: new Date().toISOString() })
      .select("id")
      .single();
    await sendPushToUser(partner.id, { title: `🔑 ${myName} sent you ${item.name}`, body: "Tap to see it. It shows once.", url: `/keys?share=${share!.id}`, tag: `vault-${share!.id}` });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "open") {
    const { data: share } = await admin.from("vault_shares").select("*").eq("id", body.id).single();
    if (!share || share.recipient !== me.id) return bad("not for you", 403);
    if (share.status !== "sent" || !share.payload_enc) return bad("Already seen. Ask again if you need it.", 410);
    // Seen once, then wiped. Only the first open wins if two taps race.
    const { data: won } = await admin.from("vault_shares").update({ status: "seen", payload_enc: null }).eq("id", share.id).eq("status", "sent").select("id");
    if (!won?.length) return bad("Already seen. Ask again if you need it.", 410);
    return NextResponse.json({ name: share.item_name, secret: open(share.payload_enc) });
  }

  return bad("unknown action");
}
