import { describe, expect, it } from "vitest";

import { mediaAlt, mediaUrl, mediaUrls } from "../index";

const RESOLVED = {
  id: "68b0a1c2d3e4f5061728394a",
  url: "https://assets.test/a.png",
  visibility: "public" as const,
};

describe("mediaUrl reads a media value whichever shape the API is on", () => {
  it("reads the url off the resolved object a current API returns", () => {
    expect(mediaUrl(RESOLVED)).toBe("https://assets.test/a.png");
  });

  it("takes the bare string an API that has not been upgraded still returns", () => {
    expect(mediaUrl("https://assets.test/legacy.png")).toBe(
      "https://assets.test/legacy.png",
    );
  });

  it("reports private media as absent rather than as a broken src", () => {
    expect(mediaUrl({ ...RESOLVED, url: null })).toBeNull();
  });

  it("gives null for an unset field, so a caller can branch on it", () => {
    expect(mediaUrl(null)).toBeNull();
    expect(mediaUrl(undefined)).toBeNull();
  });

  it("treats an empty string as absent - it would render a broken image", () => {
    expect(mediaUrl("")).toBeNull();
  });
});

describe("mediaUrls keeps a gallery renderable", () => {
  it("reads a mixed list, which is what a transition looks like", () => {
    expect(mediaUrls([RESOLVED, "https://assets.test/legacy.png"])).toEqual([
      "https://assets.test/a.png",
      "https://assets.test/legacy.png",
    ]);
  });

  it("drops entries with no url instead of rendering a hole", () => {
    expect(mediaUrls([RESOLVED, { ...RESOLVED, url: null }, null])).toEqual([
      "https://assets.test/a.png",
    ]);
  });

  it("gives an empty list for a field that is not a list at all", () => {
    expect(mediaUrls(null)).toEqual([]);
    expect(mediaUrls(undefined)).toEqual([]);
  });
});

describe("mediaAlt", () => {
  it("hands over the alt text the library holds", () => {
    expect(mediaAlt({ ...RESOLVED, alt: "A cat" })).toBe("A cat");
  });

  it("has nothing to offer for a bare string, and says so", () => {
    expect(mediaAlt("https://assets.test/legacy.png")).toBeUndefined();
    expect(mediaAlt(RESOLVED)).toBeUndefined();
  });
});
