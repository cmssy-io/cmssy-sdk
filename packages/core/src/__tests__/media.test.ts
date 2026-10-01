import type { ResolvedMedia } from "@cmssy/types";
import { describe, expect, it } from "vitest";

import {
  MediaType,
  mediaAlt,
  mediaDuration,
  mediaType,
  mediaTypeValues,
  mediaUrl,
  mediaUrls,
} from "../index";

const RESOLVED = {
  id: "68b0a1c2d3e4f5061728394a",
  url: "https://assets.test/a.png",
  visibility: "public",
  type: "image",
} satisfies ResolvedMedia;

const CLIP = {
  id: "68b0a1c2d3e4f5061728394b",
  url: "https://assets.test/b.mp4",
  visibility: "public",
  type: "video",
  duration: 12.5,
} satisfies ResolvedMedia;

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

describe("mediaType is what makes a mixed gallery partitionable", () => {
  it("names the kind the library stored, without anyone parsing a url", () => {
    expect([mediaType(RESOLVED), mediaType(CLIP)]).toEqual(["image", "video"]);
  });

  it("still names the kind when the asset is private and has no url at all", () => {
    expect(
      mediaType({ ...CLIP, url: null }),
      "A private video has no url to guess from, so a url-sniffing partition puts it in the wrong bucket. The stored kind is the only thing that survives visibility.",
    ).toBe("video");
  });

  it("has nothing to offer for the bare string a pre-CMS-1149 API returns", () => {
    expect(
      mediaType("https://assets.test/legacy.mp4"),
      "Returning a guess from the extension here would be the url-sniffing this field exists to replace, and it would be wrong for every extensionless CDN url. A caller gets undefined and decides.",
    ).toBeUndefined();
  });

  it("gives undefined for an unset field rather than inventing a kind", () => {
    expect(mediaType(null)).toBeUndefined();
    expect(mediaType(undefined)).toBeUndefined();
  });

  it.each(mediaTypeValues)("carries %s through unchanged", (kind) => {
    expect(
      mediaType({ ...RESOLVED, type: kind }),
      `Only image and video appear in the fixtures above, so a swap confined to ${kind} survives every other assertion in this file - a consumer filtering a field on this kind would get an empty list with the suite green.`,
    ).toBe(kind);
  });

  it("refuses a kind outside the vocabulary rather than passing it off as one", () => {
    const fifth = { ...RESOLVED, type: "model3d" } as unknown as ResolvedMedia;

    expect(
      mediaType(fifth),
      "The vocabulary is append-only and cmssy validates it only on create, so a site pinned to this version can receive a kind added after it shipped. Returning it would hand a four-member union a fifth value, and the exhaustive `switch` a four-member union invites would throw inside the gallery. undefined is the honest answer: unknown to THIS version.",
    ).toBeUndefined();
  });
});

describe("mediaDuration", () => {
  it("reads how long the clip runs", () => {
    expect(mediaDuration(CLIP)).toBe(12.5);
  });

  it("has nothing for a still image, which has no duration to report", () => {
    expect(mediaDuration(RESOLVED)).toBeUndefined();
  });

  it("passes a duration through verbatim instead of filtering it", () => {
    expect(
      mediaDuration({ ...CLIP, duration: 0 }),
      "0 is not reachable through cmssy - the backend validates duration as positive and omits the key when it is unknown - so this is not a 0:00 badge being defended. What it pins is that the accessor does no filtering of its own: `|| undefined` or `?? null` here would also rewrite the sub-second durations that ARE reachable, and `mediaDuration` would stop being a plain read.",
    ).toBe(0);
  });

  it("has nothing for a bare string or an unset field", () => {
    expect(mediaDuration("https://assets.test/legacy.mp4")).toBeUndefined();
    expect(mediaDuration(null)).toBeUndefined();
  });
});

describe("a consumer can split a multiple media field by kind (CMS-1970)", () => {
  const GALLERY = [RESOLVED, CLIP, { ...RESOLVED, id: "third" }];

  it("separates stills from clips on the stored kind alone", () => {
    const stills = GALLERY.filter((item) => mediaType(item) === MediaType.IMAGE);
    const clips = GALLERY.filter((item) => mediaType(item) === MediaType.VIDEO);

    expect(
      [stills.map((item) => item.id), clips.map((item) => item.id)],
      "This is the whole point of CMS-1970: before the field existed the only way to tell an entry apart was to parse its url, which fails for a private asset and for any extensionless CDN url. If this ever goes red the mixed gallery is unbuildable again.",
    ).toEqual([
      ["68b0a1c2d3e4f5061728394a", "third"],
      ["68b0a1c2d3e4f5061728394b"],
    ]);
  });

  it("offers the kinds as a vocabulary, so nobody has to compare strings", () => {
    expect(
      [...mediaTypeValues].sort(),
      "A consumer building a filter control needs the full set. Hand-writing it is how a UI ends up missing a kind the library already stores.",
    ).toEqual(["audio", "document", "image", "video"]);
  });
});

type MutuallyAssignable<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;

type TheKindIsExactlyTheFourKinds = MutuallyAssignable<
  ResolvedMedia["type"],
  "image" | "video" | "document" | "audio"
>;

describe("the pinned @cmssy/types still declares what this package forwards", () => {
  it("pins the kind to exactly the four kinds, in both directions", () => {
    const kindIsExact: TheKindIsExactlyTheFourKinds = true;

    expect(
      kindIsExact,
      "The gate is the annotation, not this comparison - `tsc --noEmit` grades it, vitest cannot. Asking only whether `type` is required catches a pin that makes it optional and a pin that drops it, and stays green on the two drifts that matter just as much: widening to `string`, and relaxing to `MediaType | null` for an asset whose kind was never recorded. Either would leave the partition above dropping entries into neither bucket. Assignability in both directions is what refuses all four, and the union is spelled out as literals on purpose - writing `MediaType` here would move with the very change being watched for.",
    ).toBe(true);
  });

  it("still carries duration, which only a bumped pin provides", () => {
    const pinned: Pick<ResolvedMedia, "type" | "duration"> = {
      type: "video",
      duration: 1,
    };

    expect(
      pinned,
      "`Pick<>` on a key the pinned package does not declare fails `tsc`. This is deliberately a second witness rather than the only one: the `CLIP` fixture at the top of the file already fails on a pin without `duration`, because `satisfies ResolvedMedia` rejects the unknown key. Both must stay - delete the fixture and this is the only thing left holding `duration`; delete this and the review trail for why the pin cannot slide back goes with it.",
    ).toEqual({ type: "video", duration: 1 });
  });
});
