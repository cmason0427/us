// The app-idea inbox (the 💡 row on Home): list what's been sent, or clear it.
//
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/ideas.mjs
//   ... node scripts/ideas.mjs --clear <path> [<path>…]   # clear the ones dealt with
//   ... node scripts/ideas.mjs --clear-all
//
// Each idea is a small text file at photos/<user id>/ideas/<time>-<id>.txt
// holding { idea, by, at }. Nothing in the app lists them.
import { createClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("missing env vars");
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const bucket = admin.storage.from("photos");

const { data: people, error } = await admin.from("profiles").select("id, display_name");
if (error) throw error;
const nameOf = new Map(people.map((p) => [p.id, p.display_name]));

const ideas = [];
for (const p of people) {
  const { data: files } = await bucket.list(`${p.id}/ideas`, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  for (const f of files ?? []) {
    const path = `${p.id}/ideas/${f.name}`;
    const { data: blob } = await bucket.download(path);
    let body = {};
    try {
      body = JSON.parse(await blob.text());
    } catch {}
    ideas.push({ path, by: nameOf.get(body.by ?? p.id) ?? "?", at: body.at ?? f.created_at, idea: body.idea ?? "" });
  }
}
ideas.sort((a, b) => a.at.localeCompare(b.at));

const [flag, ...rest] = process.argv.slice(2);
if (flag === "--clear" || flag === "--clear-all") {
  const paths = flag === "--clear-all" ? ideas.map((i) => i.path) : rest;
  if (!paths.length) throw new Error("nothing to clear");
  const { error: rmError } = await bucket.remove(paths);
  if (rmError) throw rmError;
  console.log(`cleared ${paths.length} idea${paths.length === 1 ? "" : "s"}`);
} else {
  if (!ideas.length) console.log("no ideas waiting");
  for (const i of ideas) console.log(`— ${i.by}, ${i.at.slice(0, 16).replace("T", " ")}\n  ${i.idea.replace(/\n/g, "\n  ")}\n  (${i.path})\n`);
}
