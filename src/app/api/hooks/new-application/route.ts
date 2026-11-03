import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { newApplicationMail, CLUB_EMAIL, type Application } from "@/lib/applications";
import { sendMail } from "@/lib/mail";

// Called by the database (migration 0010) right after a new application is saved:
// it emails the club mailbox so nobody has to keep checking the CMS. The database
// sends the row itself, and a shared secret (APPLICATION_HOOK_SECRET here, the
// vault secret `application_hook_secret` there) proves the call came from it.

function authorised(header: string | null): boolean {
  const secret = process.env.APPLICATION_HOOK_SECRET?.trim();
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorised(req.headers.get("x-hook-secret"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let row: Application;
  try {
    row = (await req.json()) as Application;
  } catch {
    return NextResponse.json({ ok: false, error: "bad body" }, { status: 400 });
  }
  if (!row?.name || !row?.reg_no) return NextResponse.json({ ok: false, error: "bad body" }, { status: 400 });

  const mail = newApplicationMail(row);
  const sent = await sendMail(CLUB_EMAIL, mail.subject, mail.text);
  return NextResponse.json(sent.ok ? { ok: true } : { ok: false, error: sent.reason }, { status: sent.ok ? 200 : 502 });
}
