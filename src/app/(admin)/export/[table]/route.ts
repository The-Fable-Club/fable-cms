import { requireCan } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { INBOXES, isInbox } from "@/lib/inbox";
import { createClient } from "@/lib/supabase/server";

/** CSV download of one sign-up list. Admin only; the database applies row level security too. */
export async function GET(_req: Request, { params }: { params: Promise<{ table: string }> }) {
  await requireCan("read_signups");
  const { table } = await params;
  if (!isInbox(table)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false });
  if (error) return new Response("Could not read the data", { status: 500 });

  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return new Response(toCsv([...INBOXES[table].columns], (data ?? []) as Record<string, unknown>[]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${table}-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
