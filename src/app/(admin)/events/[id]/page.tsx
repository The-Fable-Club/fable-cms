import { notFound } from "next/navigation";
import { EventForm } from "@/components/event-form";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { EventRow } from "@/lib/snapshot";
import { saveEventAction } from "../../content-actions";

export const metadata = { title: "Edit event" };

export default async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const num = Number(id);
  if (!Number.isInteger(num)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("*").eq("id", num).maybeSingle();
  if (!data) notFound();
  const { id: _id, ...event } = data as EventRow;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Edit event</h1>
      <EventForm action={saveEventAction.bind(null, num)} event={event} author={admin.username} />
    </div>
  );
}
