/** Human time for a notification, rendered in the recipient's timezone. */
export function formatWhen(iso: string, allDay: boolean, timeZone: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });
  if (allDay) return day;
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  return `${day} · ${time}`;
}
