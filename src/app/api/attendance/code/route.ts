import { requireCan } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    await requireCan("read_signups");
  } catch {
    return Response.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const checkpointId = Number(searchParams.get("checkpointId"));
  if (!Number.isInteger(checkpointId) || checkpointId <= 0) {
    return Response.json({ ok: false, message: "Invalid checkpointId." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_checkpoint_code", { p_checkpoint_id: checkpointId });
  if (error) {
    return Response.json({ ok: false, message: error.message }, { status: 500 });
  }

  return Response.json(data, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
