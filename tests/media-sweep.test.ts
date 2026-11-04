import { describe, expect, it } from "vitest";
import { linkedIds, planSweep, releaseUrls, type IkFile, type SweepMediaRow } from "@/lib/media-sweep";

const NOW = new Date("2026-11-10T12:00:00Z");
const OLD = "2026-11-01T00:00:00Z";
const NEW = "2026-11-10T11:00:00Z"; // within the 24 h grace
const ik = (p: string) => `https://ik.imagekit.io/thefableclub${p}`;
const file = (id: string, path: string, createdAt = OLD): IkFile => ({ fileId: id, filePath: path, url: ik(path), createdAt });
const row = (id: number, fileId: string, path: string, uploaded_at = OLD): SweepMediaRow => ({ id, provider: "imagekit", file_id: fileId, url: ik(path), uploaded_at });

const plan = (o: Partial<Parameters<typeof planSweep>[0]>) =>
  planSweep({ root: "/fable", media: [], linked: new Set(), inReleases: new Set(), files: [], now: NOW, ...o });

describe("planSweep", () => {
  it("keeps what an event or member links to", () => {
    const p = plan({ media: [row(1, "f1", "/fable/events/a/x.webp")], files: [file("f1", "/fable/events/a/x.webp")], linked: new Set([1]) });
    expect(p).toEqual({ rows: [], files: [], kept: 1 });
  });
  it("keeps what one of the last releases uses, even when unlinked now (rollback stays safe)", () => {
    const p = plan({
      media: [row(1, "f1", "/fable/events/a/x.webp"), row(2, "f2", "/fable/events/a/loop.mp4")],
      files: [file("f1", "/fable/events/a/x.webp"), file("f2", "/fable/events/a/loop.mp4")],
      inReleases: releaseUrls([{ events: [{ photo: ik("/fable/events/a/x.webp?tr=w-640"), media: [{ url: ik("/fable/events/a/loop.mp4"), poster: ik("/fable/events/a/loop.mp4/ik-thumbnail.jpg") }] }], members: [] }]),
    });
    expect(p.rows).toEqual([]);
    expect(p.files).toEqual([]);
  });
  it("keeps recent uploads (a form that hasn't been saved yet)", () => {
    const p = plan({ media: [row(1, "f1", "/fable/events/a/x.webp", NEW)], files: [file("f1", "/fable/events/a/x.webp", NEW), file("f9", "/fable/events/a/orphan.webp", NEW)] });
    expect(p.files).toEqual([]);
    expect(p.kept).toBe(2);
  });
  it("deletes an unused, old upload: its record and its file", () => {
    const p = plan({ media: [row(1, "f1", "/fable/events/a/x.webp")], files: [file("f1", "/fable/events/a/x.webp")] });
    expect(p.rows).toEqual([1]);
    expect(p.files).toEqual([{ fileId: "f1", filePath: "/fable/events/a/x.webp", why: "unused upload" }]);
  });
  it("deletes old orphan files (no record, e.g. a half-failed upload)", () => {
    const p = plan({ files: [file("f7", "/fable/members/b/p.webp")] });
    expect(p.files).toEqual([{ fileId: "f7", filePath: "/fable/members/b/p.webp", why: "orphan file" }]);
    expect(p.rows).toEqual([]);
  });
  it("never touches anything outside the root folder", () => {
    const p = plan({ files: [file("s1", "/default-image.jpg"), file("s2", "/sample-video.mp4"), file("t1", "/fable-test/events/a/x.webp"), file("t2", "/fablex/y.webp")] });
    expect(p.files).toEqual([]);
  });
  it("an unused record whose file is already gone is still removed", () => {
    const p = plan({ media: [row(3, "gone", "/fable/events/a/old.webp")] });
    expect(p.rows).toEqual([3]);
    expect(p.files).toEqual([]);
  });
  it("leaves old Supabase-storage records alone", () => {
    const p = plan({ media: [{ id: 5, provider: "supabase", file_id: null, url: null, uploaded_at: OLD }] });
    expect(p).toEqual({ rows: [], files: [], kept: 0 });
  });
});

describe("helpers", () => {
  it("collects linked ids from events and members", () => {
    expect([...linkedIds([{ media_ids: ["3", 4] }, { media_ids: null }], [{ photo_id: 9 }, { photo_id: null }])].sort()).toEqual([3, 4, 9]);
  });
  it("collects every address a release uses, without transforms", () => {
    const urls = releaseUrls([{ events: [{ photo: null, media: [] }], members: [{ photo: ik("/fable/members/m/p.webp?tr=w-320") }] }, null]);
    expect([...urls]).toEqual([ik("/fable/members/m/p.webp")]);
  });
});
