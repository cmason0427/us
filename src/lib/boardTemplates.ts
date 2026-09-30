// Board templates: a starting layout of stickies, text and photo grids you can
// drop onto any board (new or not). Positions are relative to a top-left
// corner; the board places them in view.

export type TemplateItem = {
  kind: "note" | "sticky" | "grid";
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  color?: string;
  style?: Record<string, unknown>;
};
export interface BoardTemplate {
  key: string;
  emoji: string;
  name: string;
  blurb: string;
  items: TemplateItem[];
}

const Y = "#fff3a8";
const P = "#ffd1dc";
const G = "#c8f0c8";
const B = "#cfe3ff";
const O = "#ffd9b3";
const V = "#e6d4ff";
const title = (text: string, w = 360): TemplateItem => ({ kind: "note", x: 0, y: 0, w, h: 44, text, style: { fs: 32, b: true, font: "serif" } });

export const TEMPLATES: BoardTemplate[] = [
  {
    key: "planner",
    emoji: "🗓️",
    name: "Planner",
    blurb: "To-dos, when, what to get, notes",
    items: [
      title("the plan"),
      { kind: "sticky", x: 0, y: 64, w: 200, h: 220, color: Y, text: "## to do\n[ ] \n[ ] \n[ ] " },
      { kind: "sticky", x: 216, y: 64, w: 184, h: 104, color: P, text: "## when\n" },
      { kind: "sticky", x: 216, y: 180, w: 184, h: 104, color: G, text: "## need to get\n- " },
      { kind: "sticky", x: 0, y: 300, w: 400, h: 110, color: B, text: "## notes\n" },
    ],
  },
  {
    key: "brainstorm",
    emoji: "💡",
    name: "Brainstorm",
    blurb: "One big idea in the middle, thoughts around it",
    items: [
      { kind: "note", x: 110, y: 170, w: 200, h: 44, text: "the big idea", style: { fs: 30, b: true, font: "serif", al: "center" } },
      { kind: "sticky", x: 0, y: 0, w: 130, h: 110, color: Y, text: "" },
      { kind: "sticky", x: 145, y: 20, w: 130, h: 110, color: P, text: "" },
      { kind: "sticky", x: 290, y: 0, w: 130, h: 110, color: G, text: "" },
      { kind: "sticky", x: 0, y: 250, w: 130, h: 110, color: B, text: "" },
      { kind: "sticky", x: 145, y: 270, w: 130, h: 110, color: O, text: "" },
      { kind: "sticky", x: 290, y: 250, w: 130, h: 110, color: V, text: "" },
    ],
  },
  {
    key: "proscons",
    emoji: "⚖️",
    name: "Pros & cons",
    blurb: "Weigh a decision without a whole talk",
    items: [
      title("should we…?"),
      { kind: "sticky", x: 0, y: 64, w: 196, h: 220, color: G, text: "## 👍 pros\n- " },
      { kind: "sticky", x: 208, y: 64, w: 196, h: 220, color: P, text: "## 👎 cons\n- " },
      { kind: "sticky", x: 0, y: 300, w: 404, h: 90, color: Y, text: "## so…\n" },
    ],
  },
  {
    key: "mood",
    emoji: "🖼️",
    name: "Moodboard",
    blurb: "A photo grid and the vibe in words",
    items: [
      title("the vibe"),
      { kind: "grid", x: 0, y: 64, w: 330, h: 330, style: { layout: "3x3" } },
      { kind: "sticky", x: 344, y: 64, w: 150, h: 200, color: V, text: "## vibe words\n- \n- \n- " },
    ],
  },
  {
    key: "costume",
    emoji: "🎃",
    name: "Costume planner",
    blurb: "Inspo, pieces to get, makeup and hair, budget",
    items: [
      title("costume"),
      { kind: "grid", x: 0, y: 64, w: 260, h: 260, style: { layout: "2x2" } },
      { kind: "sticky", x: 274, y: 64, w: 190, h: 170, color: O, text: "## pieces\n[ ] \n[ ] \n[ ] " },
      { kind: "sticky", x: 274, y: 246, w: 190, h: 120, color: V, text: "## makeup + hair\n- " },
      { kind: "sticky", x: 0, y: 340, w: 260, h: 80, color: G, text: "## budget\n" },
    ],
  },
  {
    key: "hair",
    emoji: "💇",
    name: "Hair ideas",
    blurb: "Inspo pics, colors, products, the plan",
    items: [
      title("hair ideas"),
      { kind: "grid", x: 0, y: 64, w: 300, h: 240, style: { layout: "1+2" } },
      { kind: "sticky", x: 314, y: 64, w: 170, h: 116, color: V, text: "## colors\n- " },
      { kind: "sticky", x: 314, y: 190, w: 170, h: 116, color: B, text: "## products\n[ ] " },
      { kind: "sticky", x: 0, y: 320, w: 484, h: 90, color: Y, text: "## when + who's doing it\n" },
    ],
  },
  {
    key: "photoshoot",
    emoji: "📸",
    name: "Photoshoot",
    blurb: "Poses, shot list, outfits, spot and gear",
    items: [
      title("photoshoot"),
      { kind: "grid", x: 0, y: 64, w: 300, h: 300, style: { layout: "3x3" } },
      { kind: "sticky", x: 314, y: 64, w: 190, h: 196, color: Y, text: "## shot list\n[ ] \n[ ] \n[ ] \n[ ] " },
      { kind: "sticky", x: 314, y: 272, w: 190, h: 92, color: B, text: "## where + when\n" },
      { kind: "grid", x: 0, y: 378, w: 300, h: 150, style: { layout: "row3" } },
      { kind: "sticky", x: 314, y: 378, w: 190, h: 150, color: P, text: "## outfits\n- \n- " },
      { kind: "sticky", x: 0, y: 542, w: 246, h: 120, color: G, text: "## gear + props\n[ ] camera / phone\n[ ] tripod\n[ ] " },
      { kind: "sticky", x: 258, y: 542, w: 246, h: 120, color: V, text: "## hair + makeup\n- " },
    ],
  },
  {
    key: "trip",
    emoji: "🧳",
    name: "Trip",
    blurb: "Where, the plan, packing, money",
    items: [
      title("the trip"),
      { kind: "sticky", x: 0, y: 64, w: 200, h: 120, color: B, text: "## where + when\n" },
      { kind: "sticky", x: 214, y: 64, w: 200, h: 120, color: G, text: "## money\n" },
      { kind: "sticky", x: 0, y: 198, w: 200, h: 200, color: Y, text: "## plan\n- " },
      { kind: "sticky", x: 214, y: 198, w: 200, h: 200, color: P, text: "## pack\n[ ] \n[ ] \n[ ] " },
    ],
  },
  {
    key: "week",
    emoji: "📆",
    name: "Week plan",
    blurb: "A sticky for each day",
    items: [
      title("this week"),
      ...["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d, k) => ({
        kind: "sticky" as const,
        x: (k % 4) * 128,
        y: 64 + Math.floor(k / 4) * 132,
        w: 118,
        h: 120,
        color: [Y, P, G, B, O, V, Y][k],
        text: `## ${d}\n`,
      })),
    ],
  },
];

export const templateSize = (t: BoardTemplate) => ({
  w: Math.max(...t.items.map((i) => i.x + i.w)),
  h: Math.max(...t.items.map((i) => i.y + i.h)),
});

/* ─── photo grid layouts ─────────────────────────────────────────────── */

export const GRID_LAYOUTS: { key: string; label: string; areas: string; cols: string; rows: string }[] = [
  { key: "2x2", label: "2×2", areas: `"a b" "c d"`, cols: "1fr 1fr", rows: "1fr 1fr" },
  { key: "3x3", label: "3×3", areas: `"a b c" "d e f" "g h i"`, cols: "1fr 1fr 1fr", rows: "1fr 1fr 1fr" },
  { key: "2x3", label: "2×3", areas: `"a b" "c d" "e f"`, cols: "1fr 1fr", rows: "1fr 1fr 1fr" },
  { key: "1+2", label: "big + 2", areas: `"a b" "a c"`, cols: "2fr 1fr", rows: "1fr 1fr" },
  { key: "2+1", label: "2 + big", areas: `"a b" "c c"`, cols: "1fr 1fr", rows: "1fr 1.4fr" },
  { key: "row3", label: "3 across", areas: `"a b c"`, cols: "1fr 1fr 1fr", rows: "1fr" },
  { key: "col3", label: "3 down", areas: `"a" "b" "c"`, cols: "1fr", rows: "1fr 1fr 1fr" },
];

export function gridLayout(key: string | undefined) {
  const l = GRID_LAYOUTS.find((x) => x.key === key) ?? GRID_LAYOUTS[0];
  const slots = [...new Set(l.areas.replace(/"/g, " ").split(/\s+/).filter(Boolean))];
  return { ...l, slots };
}

/** Drop a template onto a board with its top-left at `origin`. Returns the new ids. */
export async function insertTemplate(threadId: string, meId: string, t: BoardTemplate, origin: { x: number; y: number }, zStart: number) {
  const { supabaseBrowser } = await import("./supabase/client");
  const rows = t.items.map((i, k) => ({
    thread_id: threadId,
    author: meId,
    kind: i.kind,
    x: Math.round(origin.x + i.x),
    y: Math.round(origin.y + i.y),
    w: i.w,
    h: i.h,
    text: i.text ?? null,
    color: i.color ?? null,
    style: i.style ?? null,
    z: zStart + k,
  }));
  const { data, error } = await supabaseBrowser().from("thread_items").insert(rows).select("id");
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}
