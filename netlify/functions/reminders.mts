import type { Config } from "@netlify/functions";

// Every 5 minutes, poke the Next.js reminder sweep. All the logic lives in
// src/app/api/cron/reminders so it can also be triggered by any other cron.
export default async function reminders() {
  const res = await fetch(`${Netlify.env.get("URL")}/api/cron/reminders`, {
    headers: { authorization: `Bearer ${Netlify.env.get("CRON_SECRET")}` },
  });
  console.log("reminders", res.status, await res.text());
}

export const config: Config = {
  schedule: "*/5 * * * *",
};
