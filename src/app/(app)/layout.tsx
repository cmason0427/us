import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { AppProvider } from "@/components/AppProvider";
import { TabBar } from "@/components/TabBar";
import { AddSheet } from "@/components/AddSheet";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return (
    <AppProvider meId={data.user.id}>
      <div className="shell">{children}</div>
      <TabBar />
      <AddSheet />
    </AppProvider>
  );
}
