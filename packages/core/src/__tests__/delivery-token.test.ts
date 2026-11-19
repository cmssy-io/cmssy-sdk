import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchLayoutKey,
  fetchLayouts,
  fetchLayoutsByKey,
  fetchPage,
  fetchPageById,
  fetchPageMeta,
  fetchPages,
  type FetchLike,
} from "../content/content-client";
import { createCmssyClient } from "../data/client";
import { graphqlRequest } from "../data/graphql-request";
import { clearWorkspaceIdCache } from "../data/settings-client";
import { checkWorkspaceReachable } from "../preflight";

const base = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "ws",
};

const TOKEN_HEADER = "x-cmssy-api-token";

function capturingFetch(payload: unknown = { data: {} }): {
  fetch: FetchLike;
  calls: Array<{ url: string; headers: Record<string, string> }>;
} {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers });
    return { ok: true, status: 200, json: async () => payload };
  };
  return { fetch, calls };
}

const deliveryCalls: Array<
  [string, (config: typeof base & { apiToken?: string }, fetch: FetchLike) => Promise<unknown>]
> = [
  ["fetchPage", (config, fetch) => fetchPage(config, "/", { fetch })],
  ["fetchPageById", (config, fetch) => fetchPageById(config, "p1", { fetch })],
  ["fetchPages", (config, fetch) => fetchPages(config, { fetch })],
  ["fetchPageMeta", (config, fetch) => fetchPageMeta(config, "/", { fetch })],
  ["fetchLayouts", (config, fetch) => fetchLayouts(config, "/", { fetch })],
  ["fetchLayoutKey", (config, fetch) => fetchLayoutKey(config, "/", { fetch })],
  [
    "fetchLayoutsByKey",
    (config, fetch) => fetchLayoutsByKey(config, "k1", { fetch }),
  ],
];

beforeEach(() => clearWorkspaceIdCache());
afterEach(() => vi.unstubAllGlobals());

describe("apiToken on delivery reads (CMS-2272)", () => {
  it.each(deliveryCalls)("%s sends the token, trimmed", async (_name, call) => {
    const { fetch, calls } = capturingFetch();
    await call({ ...base, apiToken: "  cs_server  " }, fetch);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.test/public/acme/ws/graphql");
    expect(calls[0]?.headers[TOKEN_HEADER]).toBe("cs_server");
  });

  it.each(deliveryCalls)(
    "%s sends no token header without an apiToken",
    async (_name, call) => {
      const { fetch, calls } = capturingFetch();
      await call(base, fetch);
      expect(calls[0]?.headers).not.toHaveProperty(TOKEN_HEADER);
    },
  );

  it.each(deliveryCalls)(
    "%s sends no token header for a blank apiToken",
    async (_name, call) => {
      const { fetch, calls } = capturingFetch();
      await call({ ...base, apiToken: "   " }, fetch);
      expect(calls[0]?.headers).not.toHaveProperty(TOKEN_HEADER);
    },
  );

  it.each(deliveryCalls)(
    "%s never sends the token from a browser",
    async (_name, call) => {
      vi.stubGlobal("window", {});
      const { fetch, calls } = capturingFetch();
      await call({ ...base, apiToken: "cs_server" }, fetch);
      expect(calls[0]?.headers).not.toHaveProperty(TOKEN_HEADER);
    },
  );

  it("keeps the dev preview authorization next to the token", async () => {
    const { fetch, calls } = capturingFetch();
    await fetchPage({ ...base, apiToken: "cs_server" }, "/", {
      fetch,
      devPreview: true,
      devToken: "cs_dev",
      workspaceId: "w1",
    });
    expect(calls[0]?.headers).toMatchObject({
      [TOKEN_HEADER]: "cs_server",
      authorization: "Bearer cs_dev",
      "x-workspace-id": "w1",
    });
  });
});

describe("apiToken through graphqlRequest (CMS-2272)", () => {
  it("sends the token on a public request", async () => {
    const { fetch, calls } = capturingFetch();
    await graphqlRequest(
      { ...base, apiToken: "cs_server" },
      "query { __typename }",
      {},
      { fetch, public: true },
    );
    expect(calls[0]?.url).toBe("https://api.test/public/acme/ws/graphql");
    expect(calls[0]?.headers[TOKEN_HEADER]).toBe("cs_server");
  });

  it("does not send the token to the admin endpoint", async () => {
    const { fetch, calls } = capturingFetch();
    await graphqlRequest(
      { ...base, apiToken: "cs_server" },
      "query { __typename }",
      {},
      { fetch },
    );
    expect(calls[0]?.url).toBe("https://api.test/graphql");
    expect(calls[0]?.headers).not.toHaveProperty(TOKEN_HEADER);
  });

  it("lets a header the caller passes win over the config token", async () => {
    const { fetch, calls } = capturingFetch();
    await graphqlRequest(
      { ...base, apiToken: "cs_server" },
      "query { __typename }",
      {},
      {
        fetch,
        public: true,
        headers: { [TOKEN_HEADER]: "cs_caller", "x-cmssy-client-ip": "1.2.3.4" },
      },
    );
    expect(calls[0]?.headers).toMatchObject({
      [TOKEN_HEADER]: "cs_caller",
      "x-cmssy-client-ip": "1.2.3.4",
    });
  });

  it("reaches the site config read of a client built from the config", async () => {
    const { fetch, calls } = capturingFetch({
      data: { public: { siteConfig: { workspaceId: "w1" } } },
    });
    await createCmssyClient({ ...base, apiToken: "cs_server" }).resolveWorkspaceId({
      fetch,
    });
    expect(calls[0]?.headers[TOKEN_HEADER]).toBe("cs_server");
  });
});

describe("apiToken on the preflight probe (CMS-2272)", () => {
  it("sends the token with the workspace probe", async () => {
    const { fetch, calls } = capturingFetch({
      data: { public: { siteConfig: { workspaceId: "w1" } } },
    });
    await checkWorkspaceReachable({ ...base, apiToken: "cs_server", fetch });
    expect(calls[0]?.headers[TOKEN_HEADER]).toBe("cs_server");
  });
});
