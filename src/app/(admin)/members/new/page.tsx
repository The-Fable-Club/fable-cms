import { MemberForm } from "@/components/member-form";
import { saveMemberAction } from "../../content-actions";

export const metadata = { title: "New member" };

export default function NewMember() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">New member</h1>
      <MemberForm action={saveMemberAction.bind(null, null)} member={null} />
    </div>
  );
}
