import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/** What a key holds. Only ever handled on the server, encrypted at rest. */
export interface VaultSecret {
  username?: string;
  password: string;
  note?: string;
}

// The key is derived from a server secret the browser never sees, so the
// database alone (or a stolen session) can't read these.
function key() {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper) throw new Error("vault key missing");
  return Buffer.from(hkdfSync("sha256", pepper, "us-vault", "vault-v1", 32));
}

export function seal(secret: VaultSecret): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(secret), "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

export function open(sealed: string): VaultSecret {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1") throw new Error("unknown vault format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(body, "base64")), d.final()]).toString("utf8"));
}
