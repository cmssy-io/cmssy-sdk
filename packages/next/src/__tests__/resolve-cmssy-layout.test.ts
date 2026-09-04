import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCmssyLayout } from "../preset/resolve-cmssy-layout";
import { NEXT_BUILD_PHASE } from "../retry-mode";

const CONFIG = {
  apiUrl: "https://api.cmssy.io/graphql",
  org: "acme",
  workspaceSlug: "shop",
  draftSecret: "draft-secret-1234",
};

const resolveWithReact = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/react", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return { ...actual, resolveCmssyLayout: resolveWithReact };
});

const original = process.env.NEXT_PHASE;

afterEach(() => {
  vi.clearAllMocks();
  if (original === undefined) delete process.env.NEXT_PHASE;
  else process.env.NEXT_PHASE = original;
});

describe("resolveCmssyLayout (@cmssy/next/server)", () => {
  it("applies the Next retry mode the phase decides, not the react default", async () => {
    process.env.NEXT_PHASE = NEXT_BUILD_PHASE;
    resolveWithReact.mockResolvedValue({ groups: [] });

    await resolveCmssyLayout(CONFIG, {
      region: "header",
      blocks: [],
      editMode: false,
      path: [],
    });

    expect(resolveWithReact).toHaveBeenCalledWith(
      CONFIG,
      expect.objectContaining({ retry: "build" }),
    );

    delete process.env.NEXT_PHASE;
    await resolveCmssyLayout(CONFIG, {
      region: "header",
      blocks: [],
      editMode: false,
      path: [],
    });
    expect(resolveWithReact).toHaveBeenLastCalledWith(
      CONFIG,
      expect.objectContaining({ retry: "interactive" }),
    );
  });

  it("forwards an explicit policy untouched and returns what react resolved", async () => {
    const resolution = { groups: [], settings: null };
    resolveWithReact.mockResolvedValue(resolution);

    const result = await resolveCmssyLayout(CONFIG, {
      region: "header",
      blocks: [],
      editMode: false,
      path: [],
      retry: false,
    });

    expect(resolveWithReact).toHaveBeenCalledWith(
      CONFIG,
      expect.objectContaining({ retry: false }),
    );
    expect(result).toBe(resolution);
  });
});

describe("resolveCmssyLayout data cache (CMS-952)", () => {
  const cache = { revalidate: 600 };

  it("turns cache into a data-cache fetch for a published read", async () => {
    resolveWithReact.mockResolvedValue({ groups: [] });
    const globalFetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", globalFetch);

    await resolveCmssyLayout(CONFIG, {
      region: "header",
      blocks: [],
      editMode: false,
      path: [],
      cache,
    });

    const passed = resolveWithReact.mock.calls[0]?.[1];
    expect(passed).not.toHaveProperty("cache");
    expect(passed.fetch).toEqual(expect.any(Function));
    await passed.fetch("https://api.cmssy.io/graphql", {
      method: "POST",
      headers: {},
      body: "{}",
    });
    expect(globalFetch).toHaveBeenCalledWith(
      "https://api.cmssy.io/graphql",
      expect.objectContaining({
        next: { revalidate: 600, tags: ["cmssy-content"] },
      }),
    );
    vi.unstubAllGlobals();
  });

  it.each([
    ["edit mode", { editMode: true }],
    ["a draft preview", { editMode: false, preview: true }],
  ])("withholds the cached fetch in %s", async (_label, live) => {
    resolveWithReact.mockResolvedValue({ groups: [] });

    await resolveCmssyLayout(CONFIG, {
      region: "header",
      blocks: [],
      path: [],
      cache,
      ...live,
    } as Parameters<typeof resolveCmssyLayout>[1]);

    expect(resolveWithReact.mock.calls[0]?.[1]).not.toHaveProperty("fetch");
  });

  it("lets an explicit fetch win over the cache", async () => {
    resolveWithReact.mockResolvedValue({ groups: [] });
    const own = vi.fn();

    await resolveCmssyLayout(CONFIG, {
      region: "header",
      blocks: [],
      editMode: false,
      path: [],
      cache,
      fetch: own,
    });

    expect(resolveWithReact.mock.calls[0]?.[1].fetch).toBe(own);
  });

  it("passes no fetch when there is no cache to opt into", async () => {
    resolveWithReact.mockResolvedValue({ groups: [] });

    await resolveCmssyLayout(CONFIG, {
      region: "header",
      blocks: [],
      editMode: false,
      path: [],
    });

    expect(resolveWithReact.mock.calls[0]?.[1]).not.toHaveProperty("fetch");
  });
});
