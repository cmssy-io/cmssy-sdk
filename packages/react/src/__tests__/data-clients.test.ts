import { describe, it, expect } from "vitest";
import type { FetchLike } from "../content/content-client";
import { createCmssyClient } from "../data/client";
import {
  FORM_QUERY,
  MODEL_RECORDS_QUERY,
  SUBMIT_FORM_MUTATION,
} from "../data/queries";

const config = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "ws",
};

function mockFetch(payload: unknown, ok = true): FetchLike {
  return async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  });
}

function capturingFetch(payload: unknown): {
  fetch: FetchLike;
  calls: Array<{
    headers: Record<string, string>;
    query: string;
    variables: Record<string, unknown>;
  }>;
} {
  const calls: Array<{
    headers: Record<string, string>;
    query: string;
    variables: Record<string, unknown>;
  }> = [];
  const fetch: FetchLike = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ headers: init.headers, ...body });
    return { ok: true, status: 200, json: async () => payload };
  };
  return { fetch, calls };
}

describe("createCmssyClient().query (raw)", () => {
  it("runs a document and returns data, without scoping", async () => {
    const { fetch, calls } = capturingFetch({
      data: { public: { form: { get: { id: "f1", name: "Contact" } } } },
    });
    const client = createCmssyClient(config);
    const data = await client.query<{
      public: { form: { get: { name: string } } };
    }>(FORM_QUERY, { formId: "f1" }, { fetch });
    expect(data.public.form.get.name).toBe("Contact");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers["x-workspace-id"]).toBeUndefined();
    expect(calls[0]?.variables).toEqual({ formId: "f1" });
  });

  it("propagates a GraphQL error", async () => {
    const fetch = mockFetch({ errors: [{ message: "boom" }] });
    const client = createCmssyClient(config);
    await expect(
      client.query(
        SUBMIT_FORM_MUTATION,
        { formId: "f1", input: {} },
        { fetch },
      ),
    ).rejects.toThrow(/boom/);
  });
});

describe("createCmssyClient().queryScoped", () => {
  it("sets the x-workspace-id header (header-scoped read, e.g. forms)", async () => {
    const { fetch, calls } = capturingFetch({
      data: { public: { form: { get: null } } },
    });
    const client = createCmssyClient(config);
    await client.queryScoped(
      FORM_QUERY,
      { formId: "f1" },
      { fetch, workspaceId: "w1" },
    );
    expect(calls[0]?.headers["x-workspace-id"]).toBe("w1");
    expect(calls[0]?.variables).toEqual({ formId: "f1" });
  });

  it("injects $workspaceId as a variable when the document declares it (records)", async () => {
    const { fetch, calls } = capturingFetch({
      data: {
        public: {
          model: { records: { items: [], total: 0, hasMore: false } },
        },
      },
    });
    const client = createCmssyClient(config);
    await client.queryScoped(
      MODEL_RECORDS_QUERY,
      { modelSlug: "posts", filter: { status: "published" } },
      { fetch, workspaceId: "w1" },
    );
    expect(calls[0]?.headers["x-workspace-id"]).toBe("w1");
    expect(calls[0]?.variables).toMatchObject({
      workspaceId: "w1",
      modelSlug: "posts",
      filter: { status: "published" },
    });
  });

  it("does not overwrite an explicit workspaceId variable", async () => {
    const { fetch, calls } = capturingFetch({
      data: {
        public: {
          model: { records: { items: [], total: 0, hasMore: false } },
        },
      },
    });
    const client = createCmssyClient(config);
    await client.queryScoped(
      MODEL_RECORDS_QUERY,
      { workspaceId: "explicit", modelSlug: "posts" },
      { fetch, workspaceId: "w1" },
    );
    expect(calls[0]?.variables.workspaceId).toBe("explicit");
    expect(calls[0]?.headers["x-workspace-id"]).toBe("w1");
  });

  it("injects the resolved id when an existing workspaceId var is nullish", async () => {
    const { fetch, calls } = capturingFetch({
      data: {
        public: {
          model: { records: { items: [], total: 0, hasMore: false } },
        },
      },
    });
    const client = createCmssyClient(config);
    await client.queryScoped(
      MODEL_RECORDS_QUERY,
      { workspaceId: undefined, modelSlug: "posts" },
      { fetch, workspaceId: "w1" },
    );
    expect(calls[0]?.variables.workspaceId).toBe("w1");
  });

  it("resolves the workspace id via site config when not provided", async () => {
    let call = 0;
    const fetch: FetchLike = async (_url, init) => {
      call += 1;
      return {
        ok: true,
        status: 200,
        json: async () =>
          call === 1
            ? {
                data: {
                  public: { siteConfig: { id: "sc", workspaceId: "w7" } },
                },
              }
            : (expect(init.headers["x-workspace-id"]).toBe("w7"),
              { data: { public: { form: { get: null } } } }),
      };
    };
    const client = createCmssyClient(config);
    await client.queryScoped(FORM_QUERY, { formId: "f1" }, { fetch });
    expect(call).toBe(2);
  });

  it("caches the resolved workspace id across calls (single round-trip)", async () => {
    let siteConfigCalls = 0;
    const fetch: FetchLike = async (_url, init) => {
      const body = JSON.parse(init.body);
      const isSiteConfig = body.query.includes("PublicSiteConfig");
      if (isSiteConfig) siteConfigCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () =>
          isSiteConfig
            ? {
                data: {
                  public: { siteConfig: { id: "sc", workspaceId: "w7" } },
                },
              }
            : { data: { public: { form: { get: null } } } },
      };
    };
    const client = createCmssyClient(config);
    await client.queryScoped(FORM_QUERY, { formId: "f1" }, { fetch });
    await client.queryScoped(FORM_QUERY, { formId: "f2" }, { fetch });
    expect(siteConfigCalls).toBe(1);
  });
});

describe("createCmssyClient().resolveWorkspaceId", () => {
  it("resolves and caches the workspace id", async () => {
    let call = 0;
    const fetch: FetchLike = async () => {
      call += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { public: { siteConfig: { id: "sc", workspaceId: "w1" } } },
        }),
      };
    };
    const client = createCmssyClient(config);
    expect(await client.resolveWorkspaceId({ fetch })).toBe("w1");
    expect(await client.resolveWorkspaceId({ fetch })).toBe("w1");
    expect(call).toBe(1);
  });

  it("throws when the workspace id can't be resolved", async () => {
    const fetch = mockFetch({ data: { public: { siteConfig: null } } });
    const client = createCmssyClient(config);
    await expect(client.resolveWorkspaceId({ fetch })).rejects.toThrow(
      /could not resolve workspaceId/,
    );
  });
});
