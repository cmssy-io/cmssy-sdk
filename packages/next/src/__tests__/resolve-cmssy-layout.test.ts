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
