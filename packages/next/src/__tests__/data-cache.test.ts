import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CMSSY_CONTENT_TAG,
  cmssyCachedFetch,
  cmssyContentTags,
} from "../data-cache";

const INIT = {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: '{"query":"{ public { siteConfig { workspaceId } } }"}',
};

function stubFetch() {
  const response = new Response("{}", { status: 200 });
  const globalFetch = vi.fn(async () => response);
  vi.stubGlobal("fetch", globalFetch);
  return { globalFetch, response };
}

afterEach(() => vi.unstubAllGlobals());

describe("cmssyCachedFetch (CMS-952)", () => {
  it("sends the SDK's request unchanged, plus the Next data-cache options", async () => {
    const { globalFetch, response } = stubFetch();
    const signal = new AbortController().signal;

    const result = await cmssyCachedFetch({ revalidate: 3600 })(
      "https://api.cmssy.io/graphql",
      { ...INIT, signal },
    );

    expect(result).toBe(response);
    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(globalFetch).toHaveBeenCalledWith("https://api.cmssy.io/graphql", {
      ...INIT,
      signal,
      next: { revalidate: 3600, tags: [CMSSY_CONTENT_TAG] },
    });
  });

  it("tags every read with cmssy-content ahead of the consumer's own tags, once", async () => {
    const { globalFetch } = stubFetch();

    await cmssyCachedFetch({
      revalidate: 60,
      tags: ["shop", CMSSY_CONTENT_TAG, "shop"],
    })("https://api.cmssy.io/graphql", INIT);

    expect(globalFetch).toHaveBeenCalledWith(
      "https://api.cmssy.io/graphql",
      expect.objectContaining({
        next: { revalidate: 60, tags: [CMSSY_CONTENT_TAG, "shop"] },
      }),
    );
  });

  it("passes revalidate: false through, so the read lives until the webhook expires it", async () => {
    const { globalFetch } = stubFetch();

    await cmssyCachedFetch({ revalidate: false })(
      "https://api.cmssy.io/graphql",
      INIT,
    );

    expect(globalFetch).toHaveBeenCalledWith(
      "https://api.cmssy.io/graphql",
      expect.objectContaining({
        next: { revalidate: false, tags: [CMSSY_CONTENT_TAG] },
      }),
    );
  });

  it("pins the tag the revalidate route expires", () => {
    expect(CMSSY_CONTENT_TAG).toBe("cmssy-content");
    expect(cmssyContentTags()).toEqual(["cmssy-content"]);
    expect(cmssyContentTags(["a", "cmssy-content"])).toEqual([
      "cmssy-content",
      "a",
    ]);
  });
});
