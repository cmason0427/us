// Set (or reset) someone's sign-in PIN from the command line.
//
//   PIN_PEPPER=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/set-pin.mjs person@example.com 1234
//
// Must use the same PIN_PEPPER as the deployed site. Mirrors /api/auth/pin/change.
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [email, pin] = process.argv.slice(2);
const { PIN_PEPPER, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!email || !/^\d{4}$/.test(pin ?? "")) throw new Error("usage: node scripts/set-pin.mjs <email> <4-digit pin>");
if (!PIN_PEPPER || !NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("missing env vars");

const digest = createHmac("sha256", PIN_PEPPER).update(`us-pin:${pin}`).digest("hex");
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error: listError } = await admin.auth.admin.listUsers();
if (listError) throw listError;
const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!user) throw new Error(`no user ${email}`);

const { error: pinError } = await admin.from("pin_logins").upsert({ user_id: user.id, pin_hmac: digest });
if (pinError) throw new Error(`couldn't save PIN (already someone else's?): ${pinError.message}`);
const { error: pwError } = await admin.auth.admin.updateUserById(user.id, { password: digest });
if (pwError) throw pwError;
console.log(`PIN set for ${email}`);
