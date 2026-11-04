import { describe, expect, it } from "vitest";
import { checkDuration, checkFile, folderFor, isImagekitUrl, parseIds, roomFor, videoPoster } from "@/lib/media";

const MB = 1024 * 1024;
const both = { image: true, video: true };

describe("checkFile", () => {
  it("accepts pictures and short loops of the allowed types", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/avif"]) expect(checkFile({ type, size: MB }, both)).toEqual({ ok: true, kind: "image" });
    for (const type of ["video/mp4", "video/webm"]) expect(checkFile({ type, size: MB }, both)).toEqual({ ok: true, kind: "video" });
  });
  it("refuses other types with a clear message", () => {
    for (const type of ["image/svg+xml", "image/gif", "text/html", "application/pdf", "video/quicktime", ""]) {
      const r = checkFile({ type, size: MB }, both);
      expect(r.ok, type).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/isn't supported/);
    }
  });
  it("enforces the size caps", () => {
    expect(checkFile({ type: "image/jpeg", size: 16 * MB }, both).ok).toBe(false);
    expect(checkFile({ type: "video/mp4", size: 21 * MB }, both).ok).toBe(false);
    expect(checkFile({ type: "video/mp4", size: 19 * MB }, both).ok).toBe(true);
  });
  it("respects what the slot allows", () => {
    const r = checkFile({ type: "video/mp4", size: MB }, { image: true, video: false });
    expect(r.ok).toBe(false);
    expect(checkFile({ type: "image/png", size: MB }, { image: false, video: true }).ok).toBe(false);
  });
});

describe("checkDuration", () => {
  it("allows loops up to 20 s", () => {
    expect(checkDuration(12)).toBeNull();
    expect(checkDuration(20)).toBeNull();
    expect(checkDuration(20.5)).toMatch(/at most 20 s/);
    expect(checkDuration(NaN)).toMatch(/Could not read/);
  });
});

describe("roomFor", () => {
  it("events take 1 video and 2 pictures, members 1 picture", () => {
    const ev = { image: 2, video: 1 };
    expect(roomFor([], ev)).toEqual({ image: true, video: true });
    expect(roomFor([{ kind: "image" }, { kind: "image" }, { kind: "video" }], ev)).toEqual({ image: false, video: false });
    expect(roomFor([{ kind: "image" }], { image: 1, video: 0 })).toEqual({ image: false, video: false });
  });
});

describe("folderFor", () => {
  it("builds the fixed folders and refuses others", () => {
    expect(folderFor("events", "spring-talk")).toBe("/fable/events/spring-talk");
    expect(folderFor("members", "a-b", "/fable-test")).toBe("/fable-test/members/a-b");
    expect(folderFor("about", "anything")).toBe("/fable/about");
    expect(folderFor("events", "../../x")).toBe("/fable/events/new");
    expect(folderFor("events", "")).toBe("/fable/events/new");
    expect(folderFor("secrets", "x")).toBeNull();
    expect(folderFor(null, "x")).toBeNull();
  });
});

describe("urls and ids", () => {
  it("only ImageKit's https host counts", () => {
    expect(isImagekitUrl("https://ik.imagekit.io/thefableclub/a.webp")).toBe(true);
    expect(isImagekitUrl("http://ik.imagekit.io/x")).toBe(false);
    expect(isImagekitUrl("https://ik.imagekit.io.evil.example/x")).toBe(false);
    expect(isImagekitUrl("javascript:alert(1)")).toBe(false);
  });
  it("poster address", () => {
    expect(videoPoster("https://ik.imagekit.io/t/a.mp4")).toBe("https://ik.imagekit.io/t/a.mp4/ik-thumbnail.jpg");
  });
  it("parses id lists", () => {
    expect(parseIds("3, 1,3,x,-2,0,7", 3)).toEqual([3, 1, 7]);
    expect(parseIds("", 3)).toEqual([]);
    expect(parseIds("9,8", 1)).toEqual([9]);
  });
});
