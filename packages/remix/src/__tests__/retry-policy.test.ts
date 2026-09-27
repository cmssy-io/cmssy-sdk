import { afterEach, describe, expect, it, vi } from "vitest";

import type { CmssyConfig } from "@cmssy/core";
import type { CmssyPageData } from "@cmssy/core";

import { createCmssyLoader } from "../loader";

const CONFIG = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "ws",
  draftSecret: "draft-secret-1234",
} satisfies CmssyConfig;

const PAGE = {
  id: "p1",
  slug: "/about",
  pageType: null,
  blocks: [],
} satisfies CmssyPageData;

const resolveCmssyLayoutSlot = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/react", () => ({ resolveCmssyLayoutSlot }));

const fetchPage = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/core/internal", async (importActual) => {
  const actual =
    await importActual<typeof import("@cmssy/core/internal")>();
  return { ...actual, fetchPage };
});

function arrange() {
  resolveCmssyLayoutSlot.mockResolvedValue({
    groups: [],
    locale: "en",
    defaultLocale: "en",
    enabledLocales: ["en"],
    path: ["about"],
  });
  fetchPage.mockResolvedValue(PAGE);
  return new Request("https://site.test/about");
}

afterEach(() => vi.clearAllMocks());

describe("createCmssyLoader retry policy (CMS-1460)", () => {
  it("uses the interactive mode by default, because a visitor is waiting", async () => {
    const request = arrange();

    await createCmssyLoader(CONFIG)({ request });

    expect(resolveCmssyLayoutSlot).toHaveBeenCalledWith(
      CONFIG,
      expect.objectContaining({ retry: "interactive" }),
    );
    expect(fetchPage).toHaveBeenCalledWith(CONFIG, ["about"], {
      previewSecret: undefined,
      retry: "interactive",
    });
  });

  it("forwards an explicit policy to both delivery calls", async () => {
    const request = arrange();

    await createCmssyLoader(CONFIG, {
      retry: { maxRetries: 7, maxRetryAfterMs: 120_000 },
    })({ request });

    expect(resolveCmssyLayoutSlot).toHaveBeenCalledWith(
      CONFIG,
      expect.objectContaining({
        retry: { maxRetries: 7, maxRetryAfterMs: 120_000 },
      }),
    );
    expect(fetchPage).toHaveBeenCalledWith(CONFIG, ["about"], {
      previewSecret: undefined,
      retry: { maxRetries: 7, maxRetryAfterMs: 120_000 },
    });
  });

  it("turns retry off for both delivery calls when the caller passes false", async () => {
    const request = arrange();

    await createCmssyLoader(CONFIG, { retry: false })({ request });

    expect(resolveCmssyLayoutSlot).toHaveBeenCalledWith(
      CONFIG,
      expect.objectContaining({ retry: false }),
    );
    expect(fetchPage).toHaveBeenCalledWith(CONFIG, ["about"], {
      previewSecret: undefined,
      retry: false,
    });
  });
});
