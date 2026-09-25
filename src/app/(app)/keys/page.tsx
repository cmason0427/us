"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sheet } from "@/components/Sheet";

interface Key {
  id: string;
  owner: string;
  name: string;
  kind: "app" | "device" | "card" | "other";
}
interface Share {
  id: string;
  item_id: string | null;
  item_name: string;
  owner: string;
  recipient: string;
  status: "requested" | "sent" | "declined" | "seen";
  created_at: string;
}
interface Secret {
  username?: string;
  password: string;
  note?: string;
}

const KIND: Record<Key["kind"], string> = { app: "📱 App", device: "💻 Device", card: "💳 Card / PIN", other: "🔑 Other" };
const icon = (k: Key["kind"]) => KIND[k].split(" ")[0];

async function vault<T = { ok?: boolean; error?: string }>(body: object): Promise<T & { error?: string }> {
  const r = await fetch("/api/vault", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}

/**
 * Keys: your own logins and PINs, private to you. You can see the NAMES of
 * each other's keys to ask for one; the owner taps Share and it shows up once
 * for the other person. Never in the feed.
 */
export default function KeysPage() {
  const { meId, partner, toast } = useApp();
  const supabase = supabaseBrowser();
  const { data: keys = [] } = useLive<Key[]>(
    "vault_items",
    async () => {
      const { data, error } = await supabase.from("vault_items").select("id, owner, name, kind").order("name");
      if (error) throw error;
      return data as Key[];
    },
    ["vault_items"],
  );
  const { data: shares = [] } = useLive<Share[]>(
    "vault_shares",
    async () => {
      const { data, error } = await supabase.from("vault_shares").select("id, item_id, item_name, owner, recipient, status, created_at").in("status", ["requested", "sent"]).order("created_at");
      if (error) throw error;
      return data as Share[];
    },
    ["vault_shares"],
  );
  const [open, setOpen] = useState<Key | "new" | null>(null);
  const [asking, setAsking] = useState(false);
  const [shown, setShown] = useState<{ name: string; secret: Secret } | null>(null);
  const wanted = useSearchParams().get("share");
  const autoOpened = useRef(false);

  const mine = keys.filter((k) => k.owner === meId);
  const theirs = keys.filter((k) => k.owner !== meId);
  const toMe = shares.filter((s) => s.recipient === meId && s.status === "sent");
  const asksForMe = shares.filter((s) => s.owner === meId && s.status === "requested");
  const myAsks = shares.filter((s) => s.recipient === meId && s.status === "requested");

  async function see(s: Share) {
    const r = await vault<{ name: string; secret: Secret }>({ action: "open", id: s.id });
    refreshAll();
    if (r.error) return toast(r.error);
    setShown(r);
  }
  // Tapped the push: show it straight away.
  useEffect(() => {
    if (!wanted || autoOpened.current) return;
    const s = toMe.find((x) => x.id === wanted);
    if (s) {
      autoOpened.current = true;
      void Promise.resolve().then(() => see(s));
    }
  });

  async function answer(s: Share, yes: boolean) {
    const r = await vault({ action: yes ? "approve" : "decline", id: s.id });
    refreshAll();
    if (r.error) return toast(r.error);
    toast(yes ? `Sent 🔑 ${partner?.display_name} can see it once` : "No worries");
  }

  return (
    <main className="page">
      <PageHead eyebrow="Just yours" title="Keys" />

      {toMe.map((s) => (
        <button key={s.id} className="card key-alert" onClick={() => see(s)}>
          🔑 <strong>{s.item_name}</strong> from {partner?.display_name}
          <span className="small muted grow" style={{ textAlign: "right" }}>
            Tap to see (once)
          </span>
        </button>
      ))}
      {asksForMe.map((s) => (
        <div key={s.id} className="card key-alert">
          <span className="grow">
            🔑 {partner?.display_name} needs <strong>{s.item_name}</strong>
          </span>
          <button className="btn btn-sm btn-ghost" onClick={() => answer(s, false)}>
            Not now
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => answer(s, true)}>
            Share
          </button>
        </div>
      ))}

      <div className="row-between" style={{ margin: "12px 0 6px" }}>
        <h2 className="small-h">My keys</h2>
        <div className="row">
          {theirs.length > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={() => setAsking(true)}>
              Ask {partner?.display_name}
            </button>
          )}
          <button className="btn btn-sm" onClick={() => setOpen("new")}>
            ＋ Add
          </button>
        </div>
      </div>
      {mine.length ? (
        <ul className="mini-list key-list">
          {mine.map((k) => (
            <li key={k.id}>
              <button onClick={() => setOpen(k)}>
                <span className="mini-emoji">{icon(k.kind)}</span>
                <span className="grow">{k.name}</span>
                <span className="faint small">•••</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">Nothing saved yet. Phone PIN, Spotify, the laptop… Only you can see what&apos;s inside; {partner?.display_name} only sees the names, so they can ask.</p>
      )}
      <p className="small faint" style={{ marginTop: 10 }}>
        Stored encrypted. Sharing shows it to the other person once, then it&apos;s gone. Never in the feed.
      </p>

      {open && (
        <Sheet title={open === "new" ? "🔑 New key" : `${icon(open.kind)} ${open.name}`} onClose={() => setOpen(null)}>
          <KeySheet item={open === "new" ? undefined : open} partnerName={partner?.display_name ?? "them"} onDone={() => setOpen(null)} />
        </Sheet>
      )}
      {asking && (
        <Sheet title={`Ask ${partner?.display_name}`} onClose={() => setAsking(false)}>
          <div className="stack-sm">
            <p className="small muted">Pick one. They get a quiet ping and can share it (or not).</p>
            <ul className="mini-list key-list">
              {theirs.map((k) => {
                const pending = myAsks.some((s) => s.item_id === k.id);
                return (
                  <li key={k.id}>
                    <button
                      disabled={pending}
                      onClick={async () => {
                        const r = await vault({ action: "request", id: k.id });
                        refreshAll();
                        if (r.error) return toast(r.error);
                        toast(`Asked 🔑 You'll get a ping when ${partner?.display_name} shares it`);
                        setAsking(false);
                      }}
                    >
                      <span className="mini-emoji">{icon(k.kind)}</span>
                      <span className="grow">{k.name}</span>
                      <span className="small faint">{pending ? "asked" : "ask"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </Sheet>
      )}
      {shown && (
        <Sheet title={`🔑 ${shown.name}`} onClose={() => setShown(null)}>
          <SecretView secret={shown.secret} />
          <p className="small faint" style={{ marginTop: 10 }}>
            This only shows once. Copy it now if you need it.
          </p>
        </Sheet>
      )}
    </main>
  );
}

function SecretView({ secret }: { secret: Secret }) {
  const { toast } = useApp();
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast("Copied"));
  return (
    <dl className="about-prompts key-secret">
      {secret.username && (
        <div>
          <dt>Login</dt>
          <dd>
            <button className="btn-link" onClick={() => copy(secret.username!)}>
              {secret.username}
            </button>
          </dd>
        </div>
      )}
      <div>
        <dt>Password</dt>
        <dd>
          <button className="btn-link key-pw" onClick={() => copy(secret.password)}>
            {secret.password}
          </button>
        </dd>
      </div>
      {secret.note && (
        <div>
          <dt>Note</dt>
          <dd style={{ whiteSpace: "pre-wrap" }}>{secret.note}</dd>
        </div>
      )}
    </dl>
  );
}

function KeySheet({ item, partnerName, onDone }: { item?: Key; partnerName: string; onDone: () => void }) {
  const { toast } = useApp();
  const [secret, setSecret] = useState<Secret | null>(null);
  const [editing, setEditing] = useState(!item);
  const [f, setF] = useState({ name: item?.name ?? "", kind: item?.kind ?? ("app" as Key["kind"]), username: "", password: "", note: "" });
  const [busy, setBusy] = useState(false);

  async function reveal() {
    const r = await vault<{ secret: Secret }>({ action: "reveal", id: item!.id });
    if (r.error) return toast(r.error);
    setSecret(r.secret);
    return r.secret;
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await vault({ action: "save", id: item?.id, name: f.name, kind: f.kind, secret: { username: f.username, password: f.password, note: f.note } });
    setBusy(false);
    if (r.error) return toast(r.error);
    refreshAll();
    toast("Saved 🔑");
    onDone();
  }

  if (!editing && item)
    return (
      <div className="stack">
        {secret ? (
          <SecretView secret={secret} />
        ) : (
          <button className="btn btn-block" onClick={reveal}>
            Show it
          </button>
        )}
        <div className="row-between">
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              if (!confirm(`Delete ${item.name}?`)) return;
              await vault({ action: "delete", id: item.id });
              refreshAll();
              onDone();
            }}
          >
            Delete
          </button>
          <div className="row">
            <button
              className="btn btn-sm"
              onClick={async () => {
                const s = secret ?? (await reveal());
                if (!s) return;
                setF({ ...f, username: s.username ?? "", password: s.password, note: s.note ?? "" });
                setEditing(true);
              }}
            >
              Edit
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={async () => {
                const r = await vault({ action: "send", id: item.id });
                if (r.error) return toast(r.error);
                toast(`Sent 🔑 ${partnerName} can see it once`);
                onDone();
              }}
            >
              Send to {partnerName}
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <form className="stack" onSubmit={save}>
      <div className="chips">
        {(Object.keys(KIND) as Key["kind"][]).map((k) => (
          <button key={k} type="button" className="chip chip-sm" aria-pressed={f.kind === k} onClick={() => setF({ ...f, kind: k })}>
            {KIND[k]}
          </button>
        ))}
      </div>
      <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Spotify, phone PIN, home PC…" required autoFocus={!item} aria-label="Name" />
      <input className="input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="Login / email (optional)" autoComplete="off" aria-label="Login" />
      <input className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="Password or PIN" required autoComplete="off" aria-label="Password" />
      <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Note (optional)" autoComplete="off" aria-label="Note" />
      <button className="btn btn-primary btn-block" disabled={busy || !f.name.trim() || !f.password.trim()}>
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
