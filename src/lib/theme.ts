// Color theme, per device. "peach" (default): peach/pink with green accents;
// "sage": green with pink accents. Colors live in globals.css under
// :root[data-theme=…].

export type Theme = "peach" | "sage";
export const THEMES: { v: Theme; label: string }[] = [
  { v: "peach", label: "Peach" },
  { v: "sage", label: "Sage" },
];
const KEY = "us:theme";
const THEME_COLOR: Record<Theme, string> = { peach: "#fcf0e9", sage: "#edf2e8" };

/** Runs in <head> before first paint so there's no flash of the wrong theme. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="sage"||t==="peach"){document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=t==="sage"?"${THEME_COLOR.sage}":"${THEME_COLOR.peach}"}}catch(e){}`;

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "sage" ? "sage" : "peach";
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[t]);
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // storage blocked: the theme just won't stick
  }
}
