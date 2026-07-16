import { describe, expect, it } from "vitest";
import type { FetchLike } from "../content/content-client";
import {
  buildEditorUrl,
  checkDraftSecret,
  checkFrameAncestors,
  checkPreviewUrl,
  checkWorkspaceReachable,
} from "../preflight";

const config = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "shop",
  draftSecret: "secret-1",
};

function respondingFetch(
  payload: unknown,
  status = 200,
): { fetch: FetchLike; calls: Array<{ url: string; body: string }> } {
  const calls: Array<{ url: string; body: string }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, body: init.body });
    return { ok: status < 400, status, json: async () => payload };
  };
  return { fetch, calls };
}

const failingFetch: FetchLike = async () => {
  throw new Error("ECONNREFUSED");
};

describe("checkWorkspaceReachable", () => {
  it("returns ok with the previewUrl on a reachable workspace", async () => {
    const { fetch, calls } = respondingFetch({
      data: {
        public: {
          siteConfig: {
            previewUrl: "http://localhost:3000",
            publicSiteUrl: "https://shop.example.com",
          },
        },
      },
    });
    const result = await checkWorkspaceReachable({ ...config, fetch });
    expect(result.status).toBe("ok");
    expect(result.previewUrl).toBe("http://localhost:3000");
    expect(calls[0]?.url).toBe("https://api.test/public/acme/shop/graphql");
  });

  it("omits previewUrl when the workspace has none", async () => {
    const { fetch } = respondingFetch({
      data: { public: { siteConfig: { previewUrl: null } } },
    });
    const result = await checkWorkspaceReachable({ ...config, fetch });
    expect(result.status).toBe("ok");
    expect(result.previewUrl).toBeUndefined();
  });

  it("fails with a slug fix when the workspace does not exist", async () => {
    const { fetch } = respondingFetch({
      errors: [
        { message: "Workspace not found", extensions: { code: "NOT_FOUND" } },
      ],
    });
    const result = await checkWorkspaceReachable({ ...config, fetch });
    expect(result.status).toBe("fail");
    expect(result.message).toContain("acme/shop");
    expect(result.fix).toContain("CMSSY_ORG_SLUG");
  });

  it("fails as not found on the prod shape - HTTP 404 and a bare message", async () => {
    const { fetch } = respondingFetch(
      { errors: [{ message: "Workspace not found" }] },
      404,
    );
    const result = await checkWorkspaceReachable({ ...config, fetch });
    expect(result.status).toBe("fail");
    expect(result.message).toContain("was not found");
    expect(result.fix).toContain("CMSSY_ORG_SLUG");
  });

  it("fails as not found when siteConfig resolves to null", async () => {
    const { fetch } = respondingFetch({
      data: { public: { siteConfig: null } },
    });
    const result = await checkWorkspaceReachable({ ...config, fetch });
    expect(result.status).toBe("fail");
    expect(result.fix).toContain("CMSSY_WORKSPACE_SLUG");
  });

  it("reports the delivery limit on HTTP 429", async () => {
    const { fetch } = respondingFetch({}, 429);
    const result = await checkWorkspaceReachable({ ...config, fetch });
    expect(result.status).toBe("fail");
    expect(result.message).toContain("delivery limit");
  });

  it("reports the delivery limit on a TOO_MANY_REQUESTS error", async () => {
    const { fetch } = respondingFetch({
      errors: [
        { message: "slow down", extensions: { code: "TOO_MANY_REQUESTS" } },
      ],
    });
    const result = await checkWorkspaceReachable({ ...config, fetch });
    expect(result.status).toBe("fail");
    expect(result.message).toContain("delivery limit");
  });

  it("fails with the endpoint when the network is unreachable", async () => {
    const result = await checkWorkspaceReachable({
      ...config,
      fetch: failingFetch,
    });
    expect(result.status).toBe("fail");
    expect(result.message).toContain(
      "https://api.test/public/acme/shop/graphql",
    );
    expect(result.fix).toContain("CMSSY_API_URL");
  });
});

describe("checkDraftSecret", () => {
  it("returns ok when the backend confirms the secret", async () => {
    const { fetch, calls } = respondingFetch({
      data: { public: { draftSecretValid: true } },
    });
    const result = await checkDraftSecret({ ...config, fetch });
    expect(result.status).toBe("ok");
    expect(calls[0]?.body).toContain("draftSecretValid");
  });

  it("fails with the settings fix when the secret is wrong", async () => {
    const { fetch } = respondingFetch({
      data: { public: { draftSecretValid: false } },
    });
    const result = await checkDraftSecret({ ...config, fetch });
    expect(result.status).toBe("fail");
    expect(result.fix).toContain("Settings → Headless");
  });

  it("fails without a request when the secret is missing", async () => {
    const { fetch, calls } = respondingFetch({});
    const result = await checkDraftSecret({
      ...config,
      draftSecret: "",
      fetch,
    });
    expect(result.status).toBe("fail");
    expect(result.message).toContain("CMSSY_DRAFT_SECRET");
    expect(calls).toHaveLength(0);
  });

  it("returns unknown when the backend does not have the field yet", async () => {
    const { fetch } = respondingFetch(
      {
        errors: [
          {
            message:
              'Cannot query field "draftSecretValid" on type "PublicQueries".',
          },
        ],
      },
      400,
    );
    const result = await checkDraftSecret({ ...config, fetch });
    expect(result.status).toBe("unknown");
    expect(result.message).toContain("does not support");
  });

  it("returns unknown on a validation error code", async () => {
    const { fetch } = respondingFetch({
      errors: [
        {
          message: "invalid query",
          extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
        },
      ],
    });
    const result = await checkDraftSecret({ ...config, fetch });
    expect(result.status).toBe("unknown");
  });

  it("returns unknown on a network error", async () => {
    const result = await checkDraftSecret({ ...config, fetch: failingFetch });
    expect(result.status).toBe("unknown");
  });
});

describe("checkPreviewUrl", () => {
  it("passes when the origins match", () => {
    const result = checkPreviewUrl(
      "http://localhost:3000/",
      "http://localhost:3000",
    );
    expect(result.status).toBe("ok");
  });

  it("fails with a paste instruction when the origins differ", () => {
    const result = checkPreviewUrl(
      "https://staging.example.com",
      "http://localhost:3000",
    );
    expect(result.status).toBe("fail");
    expect(result.message).toContain("https://staging.example.com");
    expect(result.fix).toContain("paste http://localhost:3000");
    expect(result.fix).toContain("Settings → Headless");
  });

  it("fails when no preview URL is set", () => {
    const result = checkPreviewUrl(undefined, "http://localhost:3000");
    expect(result.status).toBe("fail");
    expect(result.fix).toContain("http://localhost:3000");
  });

  it("fails on an unparseable preview URL", () => {
    const result = checkPreviewUrl("not a url", "http://localhost:3000");
    expect(result.status).toBe("fail");
    expect(result.message).toContain("not a url");
  });
});

describe("checkFrameAncestors", () => {
  it("passes when no CSP header is present", () => {
    expect(checkFrameAncestors(null).status).toBe("ok");
    expect(checkFrameAncestors(undefined).status).toBe("ok");
    expect(checkFrameAncestors("").status).toBe("ok");
  });

  it("passes when the CSP has no frame-ancestors directive", () => {
    const result = checkFrameAncestors("default-src 'self'; img-src *");
    expect(result.status).toBe("ok");
  });

  it("passes when frame-ancestors allows the cmssy origins", () => {
    const result = checkFrameAncestors(
      "frame-ancestors https://cmssy.io https://www.cmssy.io",
    );
    expect(result.status).toBe("ok");
  });

  it("passes on a wildcard", () => {
    expect(checkFrameAncestors("frame-ancestors *").status).toBe("ok");
  });

  it("passes on a scheme-less cmssy host", () => {
    expect(checkFrameAncestors("frame-ancestors cmssy.io").status).toBe("ok");
  });

  it("fails when frame-ancestors blocks the editor", () => {
    const result = checkFrameAncestors(
      "default-src 'self'; frame-ancestors 'self'",
    );
    expect(result.status).toBe("fail");
    expect(result.fix).toContain("https://cmssy.io");
  });

  it("fails on 'none'", () => {
    const result = checkFrameAncestors("frame-ancestors 'none'");
    expect(result.status).toBe("fail");
  });
});

describe("buildEditorUrl", () => {
  it("builds the workspace editor deep link", () => {
    expect(buildEditorUrl({ org: "acme", workspaceSlug: "shop" })).toBe(
      "https://www.cmssy.io/dashboard/organizations/acme/workspaces/shop/editor",
    );
  });

  it("appends the pageId when given", () => {
    expect(
      buildEditorUrl({ org: "acme", workspaceSlug: "shop" }, "page 1"),
    ).toBe(
      "https://www.cmssy.io/dashboard/organizations/acme/workspaces/shop/editor?pageId=page%201",
    );
  });
});
