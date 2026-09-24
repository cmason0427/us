"use client";

import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { OURS, TaskList } from "@/components/TaskList";
import { Wavy } from "@/components/Art";

/** To-dos: ours (shared, incl. dog to-dos) and just mine (private). */
export default function ListsPage() {
  const { partner } = useApp();
  return (
    <main className="page">
      <PageHead eyebrow="Keeping track" title="To-dos" />
      <Wavy />
      <TaskList listType="shared" show={OURS} title="Ours" hint="Shared, including dog to-dos. Tap one to edit it." />
      <div className="checker" style={{ margin: "22px 0 4px" }} />
      <TaskList listType="personal" title="Just mine" hint={`Private — ${partner?.display_name ?? "they"} can't see these.`} />
    </main>
  );
}
