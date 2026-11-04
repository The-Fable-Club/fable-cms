import { createHmac, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { folderFor } from "@/lib/media";
import { can } from "@/lib/roles";

// Short-lived upload credentials for ImageKit, handed only to a signed-in creator or above.
// The browser uploads straight to ImageKit with these; the private key never leaves the server.
// ImageKit's scheme: signature = HMAC-SHA1(token + expire) with the private key. The signature
// authorises an upload by this account — it does NOT by itself pin the folder, type or size, so
// the client sends those and the CMS trusts its own staff (creator+) not to abuse them; the
// media table is the source of truth and the clean-up sweep removes anything it doesn't reference.

export const runtime = "nodejs";

const EXPIRY_SECONDS = 120; // enough to start an upload, short enough to be useless if it leaks

export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!can(admin?.role, "upload_media")) {
    return NextResponse.json({ error: "Not allowed." }, { status: admin ? 403 : 401 });
  }

  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY?.trim();
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY?.trim();
  if (!privateKey || !publicKey) {
    return NextResponse.json({ error: "Uploads are not configured." }, { status: 503 });
  }

  const params = new URL(req.url).searchParams;
  const root = process.env.IMAGEKIT_FOLDER_ROOT?.trim().replace(/\/+$/, "") || "/fable";
  const folder = folderFor(params.get("kind"), params.get("slug"), root);
  if (!folder) return NextResponse.json({ error: "Unknown upload folder." }, { status: 400 });

  const token = randomUUID();
  const expire = Math.floor(Date.now() / 1000) + EXPIRY_SECONDS;
  const signature = createHmac("sha1", privateKey).update(token + expire).digest("hex");

  // No caching: each call is a fresh, single-use token.
  return NextResponse.json({ token, expire, signature, publicKey, folder }, { headers: { "Cache-Control": "no-store" } });
}
