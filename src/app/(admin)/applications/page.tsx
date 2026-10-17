import { Inbox } from "@/components/inbox";
import { requireCan } from "@/lib/auth";
import { can } from "@/lib/roles";
import { isStatus } from "@/lib/inbox";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Applications" };

export default async function Applications({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await requireCan("read_signups");
  const { status } = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("applications").select("*").order("created_at", { ascending: false }).limit(500);
  if (status && isStatus("applications", status)) q = q.eq("status", status);
  const { data } = await q;
  return <Inbox table="applications" canTriage={can(admin.role, "triage_signups")} filter={status} rows={(data ?? []) as never[]} />;
}
