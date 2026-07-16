import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runLink, type LinkDeps } from "../link";

interface RecordedCall {
  url: string;
  headers: Record<string, string>;
  query: string;
  variables: Record<string, unknown>;
}

const workspaces = [
  { id: "w1", slug: "shop", name: "Shop", organizationSlug: "acme" },
  { id: "w2", slug: "blog", name: "Blog", organizationSlug: "acme" },
];

function adminFetch(overrides: Partial<Record<string, unknown>> = {}): {
  fetch: typeof globalThis.fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetch = (async (url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      query: string;
      variables: Record<string, unknown>;
    };
    calls.push({
      url: String(url),
      headers: Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>),
      ),
      query: body.query,
      variables: body.variables,
    });
    if (body.query.includes("CliWorkspacesMine")) {
      return Response.json(
        overrides.mine ?? { data: { workspace: { mine: workspaces } } },
      );
    }
    if (body.query.includes("CliDraftSecret")) {
      return Response.json(
        overrides.draftSecret ?? {
          data: { workspace: { draftSecret: "s3cret" } },
        },
      );
    }
    if (body.query.includes("CliSetPreviewUrl")) {
      return Response.json(
        overrides.setPreviewUrl ?? {
          data: {
            siteConfig: { update: { previewUrl: "http://localhost:3000" } },
          },
        },
      );
    }
    if (body.query.includes("PreflightSiteConfig")) {
      return Response.json(
        overrides.siteConfig ?? {
          data: {
            public: { siteConfig: { previewUrl: "http://localhost:3000" } },
          },
        },
      );
    }
    return Response.json(
      overrides.draftSecretValid ?? {
        data: { public: { draftSecretValid: true } },
      },
    );
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

function makeDeps(
  fetch: typeof globalThis.fetch,
  overrides: Partial<LinkDeps> = {},
): { deps: LinkDeps; lines: string[]; cwd: string } {
  const cwd = mkdtempSync(join(tmpdir(), "cmssy-link-"));
  const lines: string[] = [];
  const deps: LinkDeps = {
    cwd,
    env: {},
    log: (line) => lines.push(line),
    fetch,
    isTty: false,
    ask: () => Promise.resolve(""),
    ...overrides,
  };
  return { deps, lines, cwd };
}

describe("runLink", () => {
  it("fails with a fix when no token is given", async () => {
    const { fetch, calls } = adminFetch();
    const { deps, lines } = makeDeps(fetch);
    const code = await runLink({}, deps);
    expect(code).toBe(1);
    expect(calls).toHaveLength(0);
    expect(lines.join("\n")).toContain("--token");
  });

  it("sends the Bearer token and scopes the secret read to the selected workspace", async () => {
    const { fetch, calls } = adminFetch();
    const { deps } = makeDeps(fetch);
    const code = await runLink({ token: "cs_test", workspace: "shop" }, deps);
    expect(code).toBe(0);
    const mine = calls.find((call) => call.query.includes("CliWorkspacesMine"));
    expect(mine?.url).toBe("https://api.cmssy.io/graphql");
    expect(mine?.headers.authorization).toBe("Bearer cs_test");
    expect(mine?.headers["x-workspace-id"]).toBeUndefined();
    const secret = calls.find((call) => call.query.includes("CliDraftSecret"));
    expect(secret?.headers["x-workspace-id"]).toBe("w1");
  });

  it("picks the workspace by org/slug and writes a merged .env.local", async () => {
    const { fetch } = adminFetch();
    const { deps, cwd } = makeDeps(fetch);
    writeFileSync(
      join(cwd, ".env.local"),
      "# keep me\nDATABASE_URL=postgres://x\nCMSSY_ORG_SLUG=stale\n",
    );
    const code = await runLink(
      { token: "cs_test", workspace: "acme/blog" },
      deps,
    );
    expect(code).toBe(0);
    const written = readFileSync(join(cwd, ".env.local"), "utf8");
    expect(written).toContain("# keep me");
    expect(written).toContain("DATABASE_URL=postgres://x");
    expect(written).toContain("CMSSY_ORG_SLUG=acme");
    expect(written).not.toContain("stale");
    expect(written).toContain("CMSSY_WORKSPACE_SLUG=blog");
    expect(written).toContain("CMSSY_DRAFT_SECRET=s3cret");
  });

  it("reads the token from .env.local via CMSSY_API_TOKEN", async () => {
    const { fetch, calls } = adminFetch();
    const { deps, cwd } = makeDeps(fetch);
    writeFileSync(join(cwd, ".env.local"), "CMSSY_API_TOKEN=cs_from_env\n");
    const code = await runLink({ workspace: "shop" }, deps);
    expect(code).toBe(0);
    expect(calls[0]?.headers.authorization).toBe("Bearer cs_from_env");
  });

  it("fails with the workspace list when several exist and there is no terminal", async () => {
    const { fetch } = adminFetch();
    const { deps, lines } = makeDeps(fetch);
    const code = await runLink({ token: "cs_test" }, deps);
    expect(code).toBe(1);
    const output = lines.join("\n");
    expect(output).toContain("--workspace");
    expect(output).toContain("acme/shop");
    expect(output).toContain("acme/blog");
  });

  it("prompts for the workspace on a terminal and never offers localhost as preview URL", async () => {
    const { fetch, calls } = adminFetch();
    const answers = ["2"];
    const { deps, lines } = makeDeps(fetch, {
      isTty: true,
      ask: () => Promise.resolve(answers.shift() ?? ""),
    });
    const code = await runLink({ token: "cs_test" }, deps);
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("Blog (acme/blog)");
    expect(calls.some((call) => call.query.includes("CliSetPreviewUrl"))).toBe(
      false,
    );
    expect(lines.join("\n")).toContain("dev-mode switch");
  });

  it("sets the preview URL from the flag without prompting", async () => {
    const { fetch, calls } = adminFetch();
    const { deps } = makeDeps(fetch);
    const code = await runLink(
      {
        token: "cs_test",
        workspace: "shop",
        previewUrl: "https://shop.example.com/some/path",
      },
      deps,
    );
    expect(code).toBe(0);
    const update = calls.find((call) =>
      call.query.includes("CliSetPreviewUrl"),
    );
    expect(update?.variables).toEqual({
      input: { previewUrl: "https://shop.example.com" },
    });
  });

  it("rejects a localhost preview URL and points at the editor dev mode", async () => {
    const { fetch, calls } = adminFetch();
    const { deps, lines } = makeDeps(fetch);
    const code = await runLink(
      {
        token: "cs_test",
        workspace: "shop",
        previewUrl: "http://localhost:3000",
      },
      deps,
    );
    expect(code).toBe(1);
    expect(calls.some((call) => call.query.includes("CliSetPreviewUrl"))).toBe(
      false,
    );
    const output = lines.join("\n");
    expect(output).toContain("DEPLOYED site");
    expect(output).toContain("dev mode");
  });

  it("leaves the preview URL unchanged when there is no flag and no terminal", async () => {
    const { fetch, calls } = adminFetch();
    const { deps, lines } = makeDeps(fetch);
    const code = await runLink({ token: "cs_test", workspace: "shop" }, deps);
    expect(code).toBe(0);
    expect(calls.some((call) => call.query.includes("CliSetPreviewUrl"))).toBe(
      false,
    );
    expect(lines.join("\n")).toContain("preview URL left unchanged");
  });

  it("prints the permission fix when the draft secret read is forbidden", async () => {
    const { fetch } = adminFetch({
      draftSecret: {
        errors: [{ message: "Forbidden", extensions: { code: "FORBIDDEN" } }],
      },
    });
    const { deps, lines } = makeDeps(fetch);
    const code = await runLink({ token: "cs_test", workspace: "shop" }, deps);
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("PAGES_EDIT");
  });

  it("rejects an unknown --workspace with the available slugs", async () => {
    const { fetch } = adminFetch();
    const { deps, lines } = makeDeps(fetch);
    const code = await runLink({ token: "cs_test", workspace: "nope" }, deps);
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("acme/shop, acme/blog");
  });

  it("fails on an invalid token without a stacktrace", async () => {
    const { fetch } = adminFetch({
      mine: {
        errors: [
          {
            message: "Unauthenticated",
            extensions: { code: "UNAUTHENTICATED" },
          },
        ],
      },
    });
    const { deps, lines } = makeDeps(fetch);
    const code = await runLink({ token: "cs_bad", workspace: "shop" }, deps);
    expect(code).toBe(1);
    const output = lines.join("\n");
    expect(output).toContain("rejected the token");
    expect(output).not.toContain("at ");
  });

  it("treats prod's bare 'Not authorized' message as a bad token", async () => {
    const { fetch } = adminFetch({
      mine: { errors: [{ message: "Not authorized" }] },
    });
    const { deps, lines } = makeDeps(fetch);
    const code = await runLink({ token: "cs_bad", workspace: "shop" }, deps);
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("rejected the token");
  });

  it("runs the preflight and prints the editor deep link on success", async () => {
    const { fetch } = adminFetch({
      draftSecretValid: {
        errors: [{ message: 'Cannot query field "draftSecretValid"' }],
      },
    });
    const { deps, lines } = makeDeps(fetch);
    const code = await runLink({ token: "cs_test", workspace: "shop" }, deps);
    expect(code).toBe(0);
    const output = lines.join("\n");
    expect(output).toContain("✓ workspace acme/shop is reachable");
    expect(output).toContain("? this cmssy platform does not support");
    expect(output).toContain(
      "https://www.cmssy.io/dashboard/organizations/acme/workspaces/shop/editor",
    );
  });
});
