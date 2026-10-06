import { parse } from "graphql";
import { beforeEach, describe, it, expect } from "vitest";
import type { FetchLike } from "../content/content-client";
import type { QueryScopedOptions } from "../data/client";
import { createCmssyClient } from "../data/client";
import { graphqlRequest } from "../data/graphql-request";
import { clearWorkspaceIdCache } from "../data/settings-client";
import type { CmssyTypedDocument } from "../data/document";
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
    url: string;
    headers: Record<string, string>;
    query: string;
    variables: Record<string, unknown>;
  }>;
} {
  const calls: Array<{
    url: string;
    headers: Record<string, string>;
    query: string;
    variables: Record<string, unknown>;
  }> = [];
  const fetch: FetchLike = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, ...body });
    return { ok: true, status: 200, json: async () => payload };
  };
  return { fetch, calls };
}

beforeEach(() => clearWorkspaceIdCache());

describe("createCmssyClient().query (raw)", () => {
  it("types the raw result from the caller's own generic, not from a shape this package declares, and does not scope it", async () => {
    const { fetch, calls } = capturingFetch({
      data: { public: { form: { get: { id: "f1", name: "Contact" } } } },
    });
    const client = createCmssyClient(config);
    const data = await client.query(FORM_QUERY, { formId: "f1" }, { fetch });
    expect(data.public.form.get?.name).toBe("Contact");
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
        { formId: "f1", input: { data: {} } },
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

  it("goes to the org-scoped delivery route, not the admin one", async () => {
    const { fetch, calls } = capturingFetch({
      data: { public: { form: { get: null } } },
    });
    const client = createCmssyClient(config);
    await client.queryScoped(
      FORM_QUERY,
      { formId: "f1" },
      { fetch, workspaceId: "w1" },
    );
    expect(calls[0]?.url).toBe("https://api.test/public/acme/ws/graphql");
    expect(calls[0]?.url).not.toBe("https://api.test/graphql");
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

describe("clients built from the same config share the workspace id (CMS-1618)", () => {
  function countingFetch() {
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
    return { fetch, siteConfigCalls: () => siteConfigCalls };
  }

  it("pays the site-config round trip once, however many clients a render builds", async () => {
    const { fetch, siteConfigCalls } = countingFetch();

    await createCmssyClient(config).queryScoped(
      FORM_QUERY,
      { formId: "f1" },
      { fetch },
    );
    await createCmssyClient(config).queryScoped(
      FORM_QUERY,
      { formId: "f2" },
      { fetch },
    );

    expect(
      siteConfigCalls(),
      "resolveRelationContent and resolveForms build a fresh client per call; a per-client cache starts cold every render and public delivery is metered.",
    ).toBe(1);
  });

  it("keeps workspaces apart in the shared cache", async () => {
    const { fetch, siteConfigCalls } = countingFetch();

    await createCmssyClient(config).resolveWorkspaceId({ fetch });
    await createCmssyClient({
      ...config,
      workspaceSlug: "other",
    }).resolveWorkspaceId({ fetch });
    await createCmssyClient({ ...config, org: "rival" }).resolveWorkspaceId({
      fetch,
    });

    expect(siteConfigCalls()).toBe(3);
  });

  it("does not remember a failed resolution", async () => {
    let attempts = 0;
    const fetch: FetchLike = async () => {
      attempts += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            public: {
              siteConfig:
                attempts === 1 ? null : { id: "sc", workspaceId: "w9" },
            },
          },
        }),
      };
    };

    await expect(
      createCmssyClient(config).resolveWorkspaceId({ fetch }),
    ).rejects.toThrow();
    await expect(
      createCmssyClient(config).resolveWorkspaceId({ fetch }),
    ).resolves.toBe("w9");
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

describe("createCmssyClient().query (typed document)", () => {
  const PRODUCTS = JSON.parse(
    JSON.stringify(
      parse(
        `query Products($workspaceId: String!, $modelSlug: String!, $limit: Int) {
          public { model { records(workspaceId: $workspaceId, modelSlug: $modelSlug, limit: $limit) { total } } }
        }`,
      ),
    ),
  ) as CmssyTypedDocument<
    { public: { model: { records: { total: number } } } },
    { workspaceId: string; modelSlug: string; limit?: number }
  >;

  it("prints the document and returns the typed result", async () => {
    const { fetch, calls } = capturingFetch({
      data: { public: { model: { records: { total: 7 } } } },
    });
    const client = createCmssyClient(config);

    const data = await client.query(
      PRODUCTS,
      { workspaceId: "w1", modelSlug: "product", limit: 10 },
      { fetch },
    );

    expect(data.public.model.records.total).toBe(7);
    expect(calls[0]?.query).toContain("query Products(");
    expect(calls[0]?.variables).toEqual({
      workspaceId: "w1",
      modelSlug: "product",
      limit: 10,
    });
  });

  it("queryScoped injects the workspace id the caller never has to carry", async () => {
    const { fetch, calls } = capturingFetch({
      data: { public: { model: { records: { total: 0 } } } },
    });
    const client = createCmssyClient(config);

    await client.queryScoped(
      PRODUCTS,
      { modelSlug: "product" },
      { fetch, workspaceId: "w1" },
    );

    expect(calls[0]?.headers["x-workspace-id"]).toBe("w1");
    expect(calls[0]?.variables).toEqual({
      modelSlug: "product",
      workspaceId: "w1",
    });
  });

  it("takes a TypedDocumentString too", async () => {
    const { fetch, calls } = capturingFetch({ data: { ok: true } });
    const client = createCmssyClient(config);
    const document = {
      toString: () => "query Ok { ok }",
    } as CmssyTypedDocument<{ ok: boolean }, Record<string, never>>;

    const data = await client.query(document, {}, { fetch });

    expect(data.ok).toBe(true);
    expect(calls[0]?.query).toBe("query Ok { ok }");
  });

  it("prints a document handed straight to graphqlRequest, without the client", async () => {
    const { fetch, calls } = capturingFetch({ data: { ok: true } });
    const document = {
      toString: () => "query Ok { ok }",
    } as CmssyTypedDocument<{ ok: boolean }, Record<string, never>>;

    const data = await graphqlRequest(config, document, {}, { fetch });

    expect(
      calls[0]?.query,
      "graphqlRequest is a root export, and a caller reaching it directly used to have to print the document itself - an object went into the `query` field and came back a 400.",
    ).toBe("query Ok { ok }");
    expect(data.ok).toBe(true);
  });
});

describe("QueryScopedOptions", () => {
  it("does not let a caller ask for the admin route", () => {
    const options: QueryScopedOptions = { workspaceId: "w1" };
    // @ts-expect-error - `public` is not part of QueryScopedOptions, so a
    // caller cannot ask queryScoped to leave the delivery route.
    options.public = false;
    expect(options.workspaceId).toBe("w1");
  });
});

describe("the document decides what a call may pass (graded by `pnpm typecheck`, not by this runner)", () => {
  const client = createCmssyClient(config);

  it("refuses a typed operation with no variables at all", () => {
    const call = () =>
      // @ts-expect-error - FORM_QUERY declares $formId: ID!, so the variables
      // argument is not optional and omitting it is a guaranteed 400.
      client.query(FORM_QUERY);
    expect(typeof call).toBe("function");
  });

  it("refuses a scoped operation with no variables at all", () => {
    const call = () =>
      // @ts-expect-error - MODEL_RECORDS_QUERY declares $modelSlug: String!,
      // which queryScoped does not inject the way it injects workspaceId.
      client.queryScoped(MODEL_RECORDS_QUERY);
    expect(typeof call).toBe("function");
  });

  it("refuses a result type pinned over a typed operation", () => {
    const call = () =>
      // @ts-expect-error - pinning Result leaves Variables at its default, which
      // is how an unchecked variables object reached the delivery API before.
      client.query<{ public: { form: { get: null } } }>(FORM_QUERY, {
        formId: "f1",
      });
    expect(typeof call).toBe("function");
  });

  it("refuses a variable the document does not declare", () => {
    const call = () =>
      client.queryScoped(FORM_QUERY, {
        formId: "f1",
        // @ts-expect-error - PublicForm takes $formId only; queryScoped offers
        // workspaceId to the documents that declare it, not to every document.
        workspaceId: "w1",
      });
    expect(typeof call).toBe("function");
  });

  it("refuses a misspelled variable", () => {
    const call = () =>
      client.query(FORM_QUERY, {
        // @ts-expect-error - formIdentifier is not $formId.
        formIdentifier: "f1",
      });
    expect(typeof call).toBe("function");
  });

  it("refuses a variable of the wrong type", () => {
    const call = () =>
      client.query(FORM_QUERY, {
        // @ts-expect-error - $formId is an ID, which arrives as a string.
        formId: 7,
      });
    expect(typeof call).toBe("function");
  });

  it("refuses a field the operation does not select", () => {
    const call = async () => {
      const data = await client.query(FORM_QUERY, { formId: "f1" });
      // @ts-expect-error - PublicForm selects no `title`, so the result type
      // has none; a pinned Result type is what used to hide that.
      return data.public.form.get?.title;
    };
    expect(typeof call).toBe("function");
  });

  it("still takes a plain string with whatever variables the caller likes", () => {
    const call = () =>
      client.query("query Anything($x: String) { anything(x: $x) }", {
        x: "free-form",
      });
    expect(typeof call).toBe("function");
  });
});
