import { afterEach, describe, expect, it, vi } from "vitest";

import { createCmssyLoader } from "../loader";

const CONFIG = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "ws",
  draftSecret: "draft-secret-1234",
} as never;

const resolveCmssyLayoutSlot = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/react", () => ({ resolveCmssyLayoutSlot }));

const fetchPage = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/core/internal", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return { ...actual, fetchPage };
});

afterEach(() => vi.clearAllMocks());

describe("createCmssyLoader page context (CMS-1708)", () => {
  it("exposes the routed page the layout blocks were resolved for", async () => {
    resolveCmssyLayoutSlot.mockResolvedValue({
      groups: [],
      locale: "en",
      defaultLocale: "en",
      enabledLocales: ["en"],
      path: ["about"],
      page: { slug: "/about", path: ["about"] },
    });
    fetchPage.mockResolvedValue({ id: "p1" });

    const data = await createCmssyLoader(CONFIG)({
      request: new Request("https://site.test/about"),
    });

    expect(data.pageContext).toStrictEqual({ slug: "/about", path: ["about"] });
  });
});
