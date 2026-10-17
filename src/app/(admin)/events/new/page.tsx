import { EventForm } from "@/components/event-form";
import { requireAdmin } from "@/lib/auth";
import { saveEventAction } from "../../content-actions";

export const metadata = { title: "New event" };

export default async function NewEvent() {
  const admin = await requireAdmin();
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">New event</h1>
      <EventForm action={saveEventAction.bind(null, null)} event={null} author={admin.username} />
    </div>
  );
}
