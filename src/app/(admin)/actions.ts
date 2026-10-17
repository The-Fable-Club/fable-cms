"use server";

import { revalidatePath } from "next/cache";
import { requireCan } from "@/lib/auth";
import { publish, republish, triggerDeploy, type PublishResult } from "@/lib/publish";
import { publishDeps, republishDeps } from "@/lib/publish-server";

export type PublishState = { result: PublishResult | null; at: number };

export async function publishAction(_prev: PublishState, form: FormData): Promise<PublishState> {
  const admin = await requireCan("publish");
  const result = await publish(await publishDeps(), { by: admin.username, note: String(form.get("note") ?? "") });
  revalidatePath("/");
  return { result, at: Date.now() };
}

/** Owner only: re-send the deploy request for a release that is already saved (e.g. after a failed hook). */
export async function retryDeployAction(form: FormData) {
  await requireCan("rollback");
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  await triggerDeploy(await publishDeps(), id);
  revalidatePath("/releases");
  revalidatePath("/");
}

/** Owner only: publish an older release again as a new release. */
export async function republishAction(_prev: PublishState, form: FormData): Promise<PublishState> {
  const owner = await requireCan("rollback");
  const result = await republish(await republishDeps(), { by: owner.username, releaseId: Number(form.get("id")) });
  revalidatePath("/releases");
  revalidatePath("/");
  return { result, at: Date.now() };
}
