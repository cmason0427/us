"use client";

const STICKERS = ["🌼", "🍄", "🌸", "✨", "🍓", "🌿", "💛"];

/**
 * A tiny sticker burst from a point (or an element). Pure DOM + Web
 * Animations, ~600ms, never blocks input. Respects reduced motion.
 */
export function celebrate(from?: HTMLElement | { x: number; y: number } | null, stickers = STICKERS) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  if (from instanceof HTMLElement) {
    const r = from.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  } else if (from) {
    ({ x, y } = from);
  }

  const count = 9;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "pop-particle";
    el.textContent = stickers[Math.floor(Math.random() * stickers.length)];
    el.style.left = `${x - 11}px`;
    el.style.top = `${y - 11}px`;
    document.body.appendChild(el);

    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
    const dist = 50 + Math.random() * 45;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 30;
    const rot = (Math.random() - 0.5) * 120;
    el.animate(
      [
        { transform: "translate(0,0) scale(0.3) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx * 0.8}px, ${dy * 0.8}px) scale(1.15) rotate(${rot * 0.6}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy + 40}px) scale(0.9) rotate(${rot}deg)`, opacity: 0 },
      ],
      { duration: 650 + Math.random() * 150, easing: "cubic-bezier(.2,.8,.3,1)" },
    ).onfinish = () => el.remove();
  }
  navigator.vibrate?.(12);
}

/** A proper confetti burst (for reveals). Falls from `from`, or the top of the screen. */
export function confetti(from?: HTMLElement | null) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = from?.getBoundingClientRect();
  const ox = r ? r.left + r.width / 2 : window.innerWidth / 2;
  const oy = r ? r.top + r.height / 3 : window.innerHeight / 4;
  const colors = ["#ff5c8a", "#ffb84d", "#ffe14d", "#5fd38d", "#4db6ff", "#9b7bff", "#ffffff"];
  for (let i = 0; i < 90; i++) {
    const el = document.createElement("span");
    const w = 6 + Math.random() * 6;
    Object.assign(el.style, {
      position: "fixed",
      left: `${ox}px`,
      top: `${oy}px`,
      width: `${w}px`,
      height: `${w * (0.4 + Math.random() * 0.8)}px`,
      background: colors[i % colors.length],
      borderRadius: Math.random() < 0.3 ? "50%" : "2px",
      pointerEvents: "none",
      zIndex: "9999",
    });
    document.body.appendChild(el);
    const a = Math.random() * Math.PI * 2;
    const v = 120 + Math.random() * 260;
    const dx = Math.cos(a) * v;
    const up = Math.sin(a) * v - 180;
    const fall = window.innerHeight * (0.5 + Math.random() * 0.5);
    const spin = (Math.random() - 0.5) * 1440;
    el.animate(
      [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx * 0.7}px, ${up}px) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${dx}px, ${up + fall}px) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: 1600 + Math.random() * 900, easing: "cubic-bezier(.2,.6,.4,1)" },
    ).onfinish = () => el.remove();
  }
}
