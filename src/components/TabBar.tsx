"use client";

import { IconPlus } from "./Art";
import { useApp } from "./AppProvider";

/** The floating ＋ (sections live in the ☰ side menu now). */
export function TabBar() {
  const { openAdd } = useApp();
  return (
    <button className="fab" onClick={() => openAdd("menu")} aria-label="Add something">
      <IconPlus />
    </button>
  );
}
