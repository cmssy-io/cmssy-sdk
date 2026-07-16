import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "../content/content-client";
import {
  collectEditDiagnostics,
  renderEditDiagnostics,
  renderEditDiagnosticsDocument,
} from "../edit-diagnostics";

const CONFIG = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "shop",
  draftSecret: "server-draft-secret-1234",
};

function apiFetch(payloads: {
  siteConfig?: unknown;
  draftSecret?: unknown;
}): FetchLike {
  return async (_url, init) => {
    const body = JSON.parse(init.body) as { query: string };
    const payload = body.query.includes("draftSecretValid")
      ? payloads.draftSecret
      : payloads.siteConfig;
    return { ok: true, status: 200, json: async () => payload };
  };
}

const REACHABLE = {
  data: {
    public: { siteConfig: { previewUrl: "http://localhost:3000" } },
  },
};

describe("collectEditDiagnostics", () => {
  it("reports missing env vars with where to get them, without touching the network", async () => {
    const fetch = vi.fn<FetchLike>();
    const diagnostics = await collectEditDiagnostics({
      config: { org: "acme" },
      providedSecret: "whatever",
      fetch,
    });

    const configuration = diagnostics.checks.find(
      (check) => check.name === "configuration",
    );
    expect(configuration?.status).toBe("fail");
    expect(configuration?.message).toContain("CMSSY_WORKSPACE_SLUG");
    expect(configuration?.message).toContain("CMSSY_DRAFT_SECRET");
    expect(configuration?.message).not.toContain("CMSSY_ORG_SLUG");
    expect(configuration?.fix).toContain("Settings → Headless");
    expect(configuration?.fix).toContain("npx @cmssy/cli link");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports an unreachable workspace", async () => {
    const diagnostics = await collectEditDiagnostics({
      config: CONFIG,
      providedSecret: "wrong",
      fetch: apiFetch({
        siteConfig: {
          errors: [
            {
              message: "Workspace not found",
              extensions: { code: "NOT_FOUND" },
            },
          ],
        },
        draftSecret: {
          errors: [
            {
              message: "Workspace not found",
              extensions: { code: "NOT_FOUND" },
            },
          ],
        },
      }),
    });

    const workspace = diagnostics.checks.find(
      (check) => check.name === "workspace",
    );
    expect(diagnostics.workspace).toBe("acme/shop");
    expect(workspace?.status).toBe("fail");
    expect(workspace?.message).toContain("acme/shop");
    expect(workspace?.message).toContain("was not found");
  });

  it("reports a secret mismatch confirmed by the platform", async () => {
    const diagnostics = await collectEditDiagnostics({
      config: CONFIG,
      providedSecret: "wrong",
      fetch: apiFetch({
        siteConfig: REACHABLE,
        draftSecret: { data: { public: { draftSecretValid: false } } },
      }),
    });

    const secret = diagnostics.checks.find(
      (check) => check.name === "draft secret",
    );
    expect(secret?.status).toBe("fail");
    expect(secret?.message).toContain("does not match");
  });

  it("points at the editor when CMSSY_DRAFT_SECRET itself is valid", async () => {
    const diagnostics = await collectEditDiagnostics({
      config: CONFIG,
      providedSecret: "stale-editor-secret",
      fetch: apiFetch({
        siteConfig: REACHABLE,
        draftSecret: { data: { public: { draftSecretValid: true } } },
      }),
    });

    const secret = diagnostics.checks.find(
      (check) => check.name === "draft secret",
    );
    expect(secret?.status).toBe("fail");
    expect(secret?.message).toContain("CMSSY_DRAFT_SECRET matches");
    expect(secret?.message).toContain(
      "the cmssySecret sent with the request does not match it",
    );
  });

  it("falls back to local verification wording when the platform cannot verify", async () => {
    const diagnostics = await collectEditDiagnostics({
      config: CONFIG,
      providedSecret: "wrong",
      fetch: apiFetch({
        siteConfig: REACHABLE,
        draftSecret: {
          errors: [
            {
              message: 'Cannot query field "draftSecretValid" on type "Public"',
              extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
            },
          ],
        },
      }),
    });

    const secret = diagnostics.checks.find(
      (check) => check.name === "draft secret",
    );
    expect(secret?.status).toBe("unknown");
    expect(secret?.message).toContain("could not verify against the platform");
    expect(secret?.message).toContain("failed local verification");
  });

  it("names a bare cmssyEdit=1 without a cmssySecret", async () => {
    const diagnostics = await collectEditDiagnostics({
      config: CONFIG,
      providedSecret: null,
      fetch: apiFetch({ siteConfig: REACHABLE }),
    });

    const secret = diagnostics.checks.find(
      (check) => check.name === "draft secret",
    );
    expect(secret?.status).toBe("fail");
    expect(secret?.message).toContain("no cmssySecret");
  });

  it("compares the workspace preview URL against the dev origin", async () => {
    const diagnostics = await collectEditDiagnostics({
      config: CONFIG,
      providedSecret: "wrong",
      devOrigin: "http://localhost:4321",
      fetch: apiFetch({
        siteConfig: REACHABLE,
        draftSecret: { data: { public: { draftSecretValid: false } } },
      }),
    });

    const preview = diagnostics.checks.find(
      (check) => check.name === "preview URL",
    );
    expect(preview?.status).toBe("fail");
    expect(preview?.message).toContain("http://localhost:3000");
    expect(preview?.message).toContain("http://localhost:4321");
  });

  it("always prints what frame-ancestors must allow", async () => {
    const diagnostics = await collectEditDiagnostics({
      config: { org: "" },
      providedSecret: null,
    });

    const frame = diagnostics.checks.find(
      (check) => check.name === "frame-ancestors",
    );
    expect(frame?.fix).toContain("https://cmssy.io");
    expect(frame?.fix).toContain("https://www.cmssy.io");
  });
});

describe("renderEditDiagnostics", () => {
  it("renders each check with its fix and never the secret value", async () => {
    const diagnostics = await collectEditDiagnostics({
      config: CONFIG,
      providedSecret: "leaked-provided-secret",
      fetch: apiFetch({
        siteConfig: REACHABLE,
        draftSecret: { data: { public: { draftSecretValid: false } } },
      }),
    });
    const html = renderEditDiagnostics(diagnostics);

    expect(html).toContain("cmssy editor diagnostics");
    expect(html).toContain("acme/shop");
    expect(html).toContain("does not match");
    expect(html).toContain("frame-ancestors");
    expect(html).toContain("development only");
    expect(html).not.toContain(CONFIG.draftSecret);
    expect(html).not.toContain("leaked-provided-secret");
  });

  it("escapes dynamic text", () => {
    const html = renderEditDiagnostics({
      workspace: 'acme/<img src="x">',
      checks: [
        {
          name: "workspace",
          status: "fail",
          message: "<script>alert(1)</script>",
        },
      ],
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });

  it("wraps the fragment into a standalone document", () => {
    const html = renderEditDiagnosticsDocument({
      workspace: "acme/shop",
      checks: [],
    });

    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("cmssy editor diagnostics");
  });
});
