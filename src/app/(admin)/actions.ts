"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { publish, triggerDeploy, type PublishResult } from "@/lib/publish";
import { publishDeps } from "@/lib/publish-server";

export type PublishState = { result: PublishResult | null; at: number };

export async function publishAction(_prev: PublishState, form: FormData): Promise<PublishState> {
  const admin = await requireAdmin();
  const result = await publish(await publishDeps(), { by: admin.username, note: String(form.get("note") ?? "") });
  revalidatePath("/");
  return { result, at: Date.now() };
}

/** Owner only: re-send the deploy request for a release that is already saved (e.g. after a failed hook). */
export async function retryDeployAction(releaseId: number) {
  await requireOwner();
  const deps = await publishDeps();
  await triggerDeploy(deps, releaseId);
  revalidatePath("/releases");
  revalidatePath("/");
}
