import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildBlockManifest, fields } from "@cmssy/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runSyncManifest, type SyncManifestDeps } from "../sync-manifest";

vi.mock("@cmssy/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cmssy/core")>();
  return { ...actual, buildBlockManifest: vi.fn(actual.buildBlockManifest) };
});

const heroBlock = {
  type: "hero",
  label: "Hero",
  icon: "sparkles",
  props: {
    title: fields.text({ required: true }),
    intro: fields.textarea({ label: "Intro" }),
  },
  component: () => null,
};

const headerBlock = {
  type: "header",
  layoutRegions: ["header"],
  props: { logo: fields.media() },
  component: () => null,
};

const layout = {
  regions: [
    { id: "header", label: "Header" },
    {
      id: "sidebar_left",
      label: "Aside",
      settings: { width: fields.number({ required: true }) },
    },
  ],
};

const WORKSPACES = [
  { id: "ws-shop", slug: "shop", name: "Shop", organizationSlug: "acme" },
  { id: "ws-blog", slug: "blog", name: "Blog", organizationSlug: "acme" },
];

interface Recorded {
  url: string;
  headers: Record<string, string>;
  body: { query: string; variables: Record<string, unknown> };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeDeps(
  overrides: {
    env?: Record<string, string | undefined>;
    modules?: Record<string, Record<string, unknown>>;
    files?: string[];
    respond?: (call: Recorded) => Response;
    storedHash?: string | null;
  } = {},
): { deps: SyncManifestDeps; lines: string[]; calls: Recorded[]; cwd: string } {
  const cwd = mkdtempSync(join(tmpdir(), "cmssy-sync-"));
  for (const file of overrides.files ?? [
    "cmssy/blocks.ts",
    "cmssy.config.ts",
  ]) {
    mkdirSync(join(cwd, file, ".."), { recursive: true });
    writeFileSync(join(cwd, file), "");
  }
  const modules = overrides.modules ?? {
    "cmssy/blocks.ts": { blocks: [heroBlock, headerBlock], category: "Site" },
    "cmssy.config.ts": {
      layout,
      cmssy: { org: "acme", workspaceSlug: "shop", layout },
    },
  };
  const lines: string[] = [];
  const calls: Recorded[] = [];
  const deps: SyncManifestDeps = {
    cwd,
    env: overrides.env ?? { CMSSY_API_TOKEN: "cs_test_token" },
    log: (line) => lines.push(line),
    fetch: (async (url: string, init: RequestInit) => {
      const call: Recorded = {
        url: String(url),
        headers: init.headers as Record<string, string>,
        body: JSON.parse(String(init.body)) as Recorded["body"],
      };
      calls.push(call);
      if (overrides.respond) return overrides.respond(call);
      if (call.body.query.includes("CliWorkspacesMine")) {
        return jsonResponse({ data: { workspace: { mine: WORKSPACES } } });
      }
      if (call.body.query.includes("CliBlockManifestHash")) {
        const stored =
          overrides.storedHash === undefined ? "0ld" : overrides.storedHash;
        return jsonResponse({
          data: {
            blockManifest: { get: stored === null ? null : { hash: stored } },
          },
        });
      }
      return jsonResponse({
        data: {
          blockManifest: {
            save: {
              hash: "abcdef1234567890",
              updatedAt: "2026-08-30T10:00:00.000Z",
            },
          },
        },
      });
    }) as unknown as typeof globalThis.fetch,
    load: async (_cwd, entry) => {
      const module = modules[entry];
      if (!module) throw new Error(`unexpected module ${entry}`);
      return module;
    },
  };
  return { deps, lines, calls, cwd };
}

describe("cmssy sync-manifest", () => {
  beforeEach(() => {
    vi.mocked(buildBlockManifest).mockClear();
  });

  it("pushes the manifest the handshake would send, authenticated with the token, to the config's workspace", async () => {
    const { deps, lines, calls } = makeDeps();

    const code = await runSyncManifest({}, deps);

    expect(code).toBe(0);
    expect(calls).toHaveLength(3);
    const [mine, current, save] = calls;
    expect(current!.body.query).toContain("blockManifest");
    expect(current!.headers["x-workspace-id"]).toBe("ws-shop");
    expect(mine!.url).toBe("https://api.cmssy.io/graphql");
    expect(mine!.headers.authorization).toBe("Bearer cs_test_token");
    expect(save!.headers.authorization).toBe("Bearer cs_test_token");
    expect(save!.headers["x-workspace-id"]).toBe("ws-shop");
    expect(save!.body.query).toContain("blockManifest");
    expect(save!.body.query).toContain(
      "save(blocks: $blocks, regions: $regions)",
    );
    expect(save!.body.variables).toStrictEqual({
      blocks: [
        {
          type: "header",
          label: "header",
          category: "Site",
          layoutRegions: ["header"],
          schema: { logo: { ...fields.media(), label: "logo" } },
        },
        {
          type: "hero",
          label: "Hero",
          category: "Site",
          icon: "sparkles",
          schema: {
            title: { ...fields.text({ required: true }), label: "title" },
            intro: { ...fields.textarea({ label: "Intro" }), label: "Intro" },
          },
        },
      ],
      regions: [
        { id: "header", label: "Header" },
        {
          id: "sidebar_left",
          label: "Aside",
          settings: {
            width: { ...fields.number({ required: true }), label: "width" },
          },
        },
      ],
    });
    expect(lines[0]).toBe(
      "cmssy: pushed 2 blocks and 2 regions to acme/shop (cmssy/blocks.ts, cmssy.config.ts)",
    );
    expect(lines).toContain("  regions: header, sidebar_left (width)");
    expect(lines).toContain(
      "  manifest abcdef123456 - updated 2026-08-30T10:00:00.000Z",
    );
  });

  it("serializes through @cmssy/core's buildBlockManifest - the handshake's serializer, not a CLI copy", async () => {
    const { deps, calls } = makeDeps();

    await runSyncManifest({}, deps);

    expect(buildBlockManifest).toHaveBeenCalledTimes(1);
    expect(buildBlockManifest).toHaveBeenCalledWith([heroBlock, headerBlock], {
      category: "Site",
      regions: layout.regions,
    });
    const returned = vi.mocked(buildBlockManifest).mock.results[0]!.value;
    expect(calls[2]!.body.variables).toStrictEqual(returned);
  });

  it("posts the same bytes on a second run - the push is idempotent", async () => {
    const first = makeDeps();
    const second = makeDeps();

    await runSyncManifest({}, first.deps);
    await runSyncManifest({}, second.deps);

    expect(JSON.stringify(first.calls[2]!.body)).toBe(
      JSON.stringify(second.calls[2]!.body),
    );
  });

  it("prints the manifest and touches nothing on --dry-run, even without a token", async () => {
    const { deps, lines, calls } = makeDeps({ env: {} });

    const code = await runSyncManifest({ dryRun: true }, deps);

    expect(code).toBe(0);
    expect(calls).toHaveLength(0);
    const printed = JSON.parse(lines.join("\n")) as {
      blocks: unknown[];
      regions: unknown[];
    };
    expect(
      printed.blocks.map((block) => (block as { type: string }).type),
    ).toEqual(["header", "hero"]);
    expect(printed.regions).toHaveLength(2);
  });

  it("sends regions: null when the config declares no layout, so the stored regions are kept - as the editor does", async () => {
    const { deps, calls, lines } = makeDeps({
      modules: {
        "cmssy/blocks.ts": { blocks: [heroBlock] },
        "cmssy.config.ts": { cmssy: { org: "acme", workspaceSlug: "shop" } },
      },
    });

    const code = await runSyncManifest({}, deps);

    expect(code).toBe(0);
    expect(calls[2]!.body.variables).toHaveProperty("regions", null);
    expect(lines[0]).toBe(
      "cmssy: pushed 1 block to acme/shop (cmssy/blocks.ts, cmssy.config.ts)",
    );
    expect(lines).toContain(
      "  regions: none declared - the stored regions are kept",
    );
  });

  it("sends the region list when the layout is declared, and reads it from cmssy.layout alone", async () => {
    const { deps, calls } = makeDeps({
      modules: {
        "cmssy/blocks.ts": { blocks: [heroBlock] },
        "cmssy.config.ts": {
          cmssy: { org: "acme", workspaceSlug: "shop", layout },
        },
      },
    });

    const code = await runSyncManifest({}, deps);

    expect(code).toBe(0);
    expect(
      (calls[2]!.body.variables.regions as Array<{ id: string }>).map(
        (r) => r.id,
      ),
    ).toEqual(["header", "sidebar_left"]);
  });

  it("orders blocks by locale, not by code point", async () => {
    const { deps, calls } = makeDeps({
      modules: {
        "cmssy/blocks.ts": {
          blocks: [
            { type: "Banner", props: {}, component: () => null },
            { type: "aside", props: {}, component: () => null },
          ],
        },
        "cmssy.config.ts": { cmssy: { org: "acme", workspaceSlug: "shop" } },
      },
    });

    await runSyncManifest({}, deps);

    expect(
      (calls[2]!.body.variables.blocks as Array<{ type: string }>).map(
        (b) => b.type,
      ),
    ).toEqual(["aside", "Banner"]);
  });

  it("says the manifest is unchanged when the workspace already holds this hash", async () => {
    const { deps, lines } = makeDeps({ storedHash: "abcdef1234567890" });

    const code = await runSyncManifest({}, deps);

    expect(code).toBe(0);
    expect(lines[0]).toBe(
      "cmssy: acme/shop already has this manifest - 2 blocks and 2 regions unchanged (cmssy/blocks.ts, cmssy.config.ts)",
    );
    expect(lines).toContain(
      "  manifest abcdef123456 - last updated 2026-08-30T10:00:00.000Z",
    );
  });

  it("reports a push when no manifest was stored before", async () => {
    const { deps, lines } = makeDeps({ storedHash: null });

    await runSyncManifest({}, deps);

    expect(lines[0]).toMatch(/^cmssy: pushed 2 blocks and 2 regions/);
  });

  it("prints the usage and touches nothing on --help", async () => {
    const { deps, lines, calls } = makeDeps({ env: {}, files: [] });

    const code = await runSyncManifest({ help: true }, deps);

    expect(code).toBe(0);
    expect(calls).toHaveLength(0);
    expect(lines[0]).toBe("usage:");
    expect(lines[1]).toContain("cmssy sync-manifest [--blocks <path>]");
  });

  it("treats a 200 with no data as a refusal with a fix, not a crash", async () => {
    const { deps, lines } = makeDeps({
      respond: () => jsonResponse({ data: null }),
    });

    const code = await runSyncManifest({}, deps);

    expect(code).toBe(1);
    expect(lines[0]).toBe("cmssy: the cmssy API returned no data (HTTP 200)");
    expect(lines[1]).toContain("CMSSY_API_URL");
  });

  it("reads the workspace from the flags before the config, and from the config before the env", async () => {
    const fromFlags = makeDeps({
      env: {
        CMSSY_API_TOKEN: "cs_test_token",
        CMSSY_ORG_SLUG: "other",
        CMSSY_WORKSPACE_SLUG: "other",
      },
    });
    await runSyncManifest({ workspace: "blog", org: "acme" }, fromFlags.deps);
    expect(fromFlags.calls[2]!.headers["x-workspace-id"]).toBe("ws-blog");

    const fromConfig = makeDeps({
      env: {
        CMSSY_API_TOKEN: "cs_test_token",
        CMSSY_ORG_SLUG: "acme",
        CMSSY_WORKSPACE_SLUG: "blog",
      },
    });
    await runSyncManifest({}, fromConfig.deps);
    expect(fromConfig.calls[2]!.headers["x-workspace-id"]).toBe("ws-shop");

    const fromEnv = makeDeps({
      env: {
        CMSSY_API_TOKEN: "cs_test_token",
        CMSSY_ORG_SLUG: "acme",
        CMSSY_WORKSPACE_SLUG: "blog",
      },
      modules: {
        "cmssy/blocks.ts": { blocks: [heroBlock] },
        "cmssy.config.ts": { layout },
      },
    });
    await runSyncManifest({}, fromEnv.deps);
    expect(fromEnv.calls[2]!.headers["x-workspace-id"]).toBe("ws-blog");
  });

  it("reads the token from .env.local without overriding the shell", async () => {
    const { deps, calls, cwd } = makeDeps({ env: {} });
    writeFileSync(join(cwd, ".env.local"), "CMSSY_API_TOKEN=cs_from_file\n");

    const code = await runSyncManifest({}, deps);

    expect(code).toBe(0);
    expect(calls[0]!.headers.authorization).toBe("Bearer cs_from_file");
  });

  it("fails with the token instruction when no token is given", async () => {
    const { deps, lines, calls } = makeDeps({ env: {} });

    const code = await runSyncManifest({}, deps);

    expect(code).toBe(1);
    expect(calls).toHaveLength(0);
    expect(lines[0]).toBe("cmssy: no API token given");
    expect(lines[1]).toContain("CMSSY_API_TOKEN");
  });

  it("fails with the workspace instruction when neither config nor env names one", async () => {
    const { deps, lines, calls } = makeDeps({
      modules: {
        "cmssy/blocks.ts": { blocks: [heroBlock] },
        "cmssy.config.ts": { layout },
      },
    });

    const code = await runSyncManifest({}, deps);

    expect(code).toBe(1);
    expect(calls).toHaveLength(0);
    expect(lines[0]).toBe(
      "cmssy: no workspace to push to: CMSSY_ORG_SLUG is not set",
    );
    expect(lines[1]).toContain("--org");
  });

  it("names the workspaces the token can reach when the configured one is not among them", async () => {
    const { deps, lines, calls } = makeDeps({
      modules: {
        "cmssy/blocks.ts": { blocks: [heroBlock] },
        "cmssy.config.ts": { cmssy: { org: "acme", workspaceSlug: "missing" } },
      },
    });

    const code = await runSyncManifest({}, deps);

    expect(code).toBe(1);
    expect(calls).toHaveLength(1);
    expect(lines[0]).toBe(
      "cmssy: the token's user is not a member of acme/missing",
    );
    expect(lines[1]).toContain("acme/shop, acme/blog");
  });

  it("does not match a workspace slug under another organization", async () => {
    const { deps, lines } = makeDeps({
      modules: {
        "cmssy/blocks.ts": { blocks: [heroBlock] },
        "cmssy.config.ts": { cmssy: { org: "globex", workspaceSlug: "shop" } },
      },
    });

    const code = await runSyncManifest({}, deps);

    expect(code).toBe(1);
    expect(lines[0]).toBe(
      "cmssy: the token's user is not a member of globex/shop",
    );
  });

  it("reports a rejected token with the token fix", async () => {
    const { deps, lines } = makeDeps({
      respond: () =>
        jsonResponse(
          {
            errors: [
              {
                message: "Authentication required",
                extensions: { code: "UNAUTHENTICATED" },
              },
            ],
          },
          401,
        ),
    });

    const code = await runSyncManifest({}, deps);

    expect(code).toBe(1);
    expect(lines[0]).toBe("cmssy: the cmssy API rejected the token");
    expect(lines[1]).toContain("Settings → API Tokens");
  });

  it("reports a missing pages:edit permission as exactly that", async () => {
    const { deps, lines } = makeDeps({
      respond: (call) =>
        call.body.query.includes("CliWorkspacesMine")
          ? jsonResponse({ data: { workspace: { mine: WORKSPACES } } })
          : jsonResponse({
              errors: [
                {
                  message: "Missing permission: pages:edit",
                  extensions: { code: "FORBIDDEN" },
                },
              ],
            }),
    });

    const code = await runSyncManifest({}, deps);

    expect(code).toBe(1);
    expect(lines[0]).toBe(
      "cmssy: the token's user cannot write this workspace's block manifest",
    );
    expect(lines[1]).toContain("PAGES_EDIT");
  });

  it("surfaces the backend's validation message when the manifest is refused", async () => {
    const { deps, lines } = makeDeps({
      respond: (call) =>
        call.body.query.includes("CliWorkspacesMine")
          ? jsonResponse({ data: { workspace: { mine: WORKSPACES } } })
          : jsonResponse({
              errors: [
                {
                  message:
                    "Invalid layout regions at regions[1].label: too long",
                  extensions: { code: "BAD_USER_INPUT" },
                },
              ],
            }),
    });

    const code = await runSyncManifest({}, deps);

    expect(code).toBe(1);
    expect(lines[0]).toBe(
      "cmssy: the cmssy API rejected the request - Invalid layout regions at regions[1].label: too long",
    );
  });

  it("fails when the API is unreachable", async () => {
    const { deps, lines } = makeDeps({
      respond: () => {
        throw new Error("ECONNREFUSED");
      },
    });

    const code = await runSyncManifest({}, deps);

    expect(code).toBe(1);
    expect(lines[0]).toBe(
      "cmssy: cannot reach the cmssy API at https://api.cmssy.io/graphql",
    );
  });

  it("targets CMSSY_API_URL when set", async () => {
    const { deps, calls } = makeDeps({
      env: {
        CMSSY_API_TOKEN: "cs_test_token",
        CMSSY_API_URL: "http://localhost:4000/graphql",
      },
    });

    await runSyncManifest({}, deps);

    expect(calls[0]!.url).toBe("http://localhost:4000/graphql");
  });

  it("finds the registry under src/ and app/ too, and honours --blocks / --config", async () => {
    const astro = makeDeps({
      files: ["src/cmssy/blocks.ts", "src/cmssy.config.ts"],
      modules: {
        "src/cmssy/blocks.ts": { blocks: [heroBlock] },
        "src/cmssy.config.ts": {
          cmssy: { org: "acme", workspaceSlug: "shop" },
        },
      },
    });
    expect(await runSyncManifest({}, astro.deps)).toBe(0);
    expect(astro.lines[0]).toContain(
      "(src/cmssy/blocks.ts, src/cmssy.config.ts)",
    );

    const remix = makeDeps({
      files: ["app/cmssy/blocks.ts", "cmssy.config.ts"],
      modules: {
        "app/cmssy/blocks.ts": { default: [heroBlock] },
        "cmssy.config.ts": { cmssy: { org: "acme", workspaceSlug: "shop" } },
      },
    });
    expect(await runSyncManifest({}, remix.deps)).toBe(0);
    expect(remix.lines[0]).toContain("(app/cmssy/blocks.ts, cmssy.config.ts)");

    const custom = makeDeps({
      files: ["lib/registry.ts", "lib/site.ts"],
      modules: {
        "lib/registry.ts": { blocks: [heroBlock] },
        "lib/site.ts": { cmssy: { org: "acme", workspaceSlug: "shop" } },
      },
    });
    expect(
      await runSyncManifest(
        { blocks: "lib/registry.ts", config: "lib/site.ts" },
        custom.deps,
      ),
    ).toBe(0);
    expect(custom.lines[0]).toContain("(lib/registry.ts, lib/site.ts)");

    const absolute = makeDeps({
      files: ["lib/registry.ts", "lib/site.ts"],
      modules: {
        "lib/registry.ts": { blocks: [heroBlock] },
        "lib/site.ts": { cmssy: { org: "acme", workspaceSlug: "shop" } },
      },
    });
    absolute.deps.load = async (_cwd, entry) =>
      entry === join(absolute.cwd, "lib/registry.ts")
        ? { blocks: [heroBlock] }
        : { cmssy: { org: "acme", workspaceSlug: "shop" } };
    expect(
      await runSyncManifest(
        {
          blocks: join(absolute.cwd, "lib/registry.ts"),
          config: join(absolute.cwd, "lib/site.ts"),
        },
        absolute.deps,
      ),
    ).toBe(0);
    expect(absolute.lines[0]).toContain(
      `(${join(absolute.cwd, "lib/registry.ts")}, `,
    );
  });

  it("fails naming the places it looked when no registry exists", async () => {
    const { deps, lines, calls } = makeDeps({ files: [] });

    const code = await runSyncManifest({}, deps);

    expect(code).toBe(1);
    expect(calls).toHaveLength(0);
    expect(lines[0]).toContain("no cmssy/blocks.ts found");
    expect(lines[1]).toContain(
      "src/cmssy/blocks.ts, src/cmssy/blocks.tsx, app/cmssy/blocks.ts",
    );
    expect(lines[1]).toContain("--blocks");
  });

  it("fails when --blocks names a file that does not exist", async () => {
    const { deps, lines } = makeDeps();

    const code = await runSyncManifest({ blocks: "nope/blocks.ts" }, deps);

    expect(code).toBe(1);
    expect(lines[0]).toBe("cmssy: nope/blocks.ts does not exist");
  });

  it("fails when the registry has no blocks array, or an entry that is not a block", async () => {
    const noArray = makeDeps({
      modules: {
        "cmssy/blocks.ts": { registry: [heroBlock] },
        "cmssy.config.ts": { layout },
      },
    });
    expect(await runSyncManifest({}, noArray.deps)).toBe(1);
    expect(noArray.lines[0]).toBe(
      "cmssy: cmssy/blocks.ts does not export a `blocks` array",
    );

    const badEntry = makeDeps({
      modules: {
        "cmssy/blocks.ts": { blocks: [heroBlock, { type: "x" }] },
        "cmssy.config.ts": { layout },
      },
    });
    expect(await runSyncManifest({}, badEntry.deps)).toBe(1);
    expect(badEntry.lines[0]).toBe(
      "cmssy: cmssy/blocks.ts: blocks[1] is not a block definition",
    );

    const empty = makeDeps({
      modules: {
        "cmssy/blocks.ts": { blocks: [] },
        "cmssy.config.ts": { layout },
      },
    });
    expect(await runSyncManifest({}, empty.deps)).toBe(1);
    expect(empty.lines[0]).toBe(
      "cmssy: cmssy/blocks.ts exports an empty `blocks` array",
    );
  });

  it("fails when the config's layout export is not a layout", async () => {
    const { deps, lines, calls } = makeDeps({
      modules: {
        "cmssy/blocks.ts": { blocks: [heroBlock] },
        "cmssy.config.ts": { layout: "header,footer" },
      },
    });

    const code = await runSyncManifest({}, deps);

    expect(code).toBe(1);
    expect(calls).toHaveLength(0);
    expect(lines[0]).toBe(
      "cmssy: cmssy.config.ts exports `layout`, but it is not a defineCmssyLayout() result",
    );
  });

  it("reports a module that fails to load with the loader's reason", async () => {
    const { deps, lines } = makeDeps();
    deps.load = async () => {
      const { CliError } = await import("../admin-client");
      throw new CliError(
        "could not load cmssy.config.ts",
        "cmssy: missing required configuration: CMSSY_DRAFT_SECRET",
      );
    };

    const code = await runSyncManifest({}, deps);

    expect(code).toBe(1);
    expect(lines).toEqual([
      "cmssy: could not load cmssy.config.ts",
      "  cmssy: missing required configuration: CMSSY_DRAFT_SECRET",
    ]);
  });
});
