import { notFound } from "next/navigation";
import { requireCan } from "@/lib/auth";
import { MemberForm } from "@/components/member-form";
import { createClient } from "@/lib/supabase/server";
import type { MemberRow } from "@/lib/snapshot";
import { saveMemberAction } from "../../content-actions";

export const metadata = { title: "Edit member" };

export default async function EditMember({ params }: { params: Promise<{ id: string }> }) {
  await requireCan("manage_members");
  const { id } = await params;
  const num = Number(id);
  if (!Number.isInteger(num)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("members").select("*").eq("id", num).maybeSingle();
  if (!data) notFound();
  const { id: _id, ...member } = data as MemberRow;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Edit member</h1>
      <MemberForm action={saveMemberAction.bind(null, num)} member={member} />
    </div>
  );
}
