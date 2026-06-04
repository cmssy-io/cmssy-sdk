import { describe, it, expect } from "vitest";
import type { FetchLike } from "../content/content-client";
import { fetchSiteConfig, resolveWorkspaceId } from "../data/settings-client";
import { fetchForm, submitForm } from "../data/form-client";
import { fetchModelDefinitions, fetchRecords } from "../data/records-client";

const config = { apiUrl: "https://api.test/graphql", workspaceSlug: "ws" };

function mockFetch(payload: unknown, ok = true): FetchLike {
  return async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  });
}

function capturingFetch(payload: unknown): {
  fetch: FetchLike;
  bodies: Array<{ query: string; variables: Record<string, unknown> }>;
} {
  const bodies: Array<{ query: string; variables: Record<string, unknown> }> =
    [];
  const fetch: FetchLike = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => payload };
  };
  return { fetch, bodies };
}

describe("fetchSiteConfig / resolveWorkspaceId", () => {
  const siteConfig = {
    id: "sc1",
    workspaceId: "w1",
    siteName: "Site",
    defaultLanguage: "en",
    enabledLanguages: ["en"],
    enabledFeatures: [],
    notFoundPageId: null,
    previewUrl: "https://app.test",
  };

  it("returns the site config", async () => {
    const fetch = mockFetch({ data: { publicSiteConfig: siteConfig } });
    const result = await fetchSiteConfig(config, { fetch });
    expect(result?.workspaceId).toBe("w1");
    expect(result?.siteName).toBe("Site");
  });

  it("returns null when absent", async () => {
    const fetch = mockFetch({ data: { publicSiteConfig: null } });
    expect(await fetchSiteConfig(config, { fetch })).toBeNull();
  });

  it("resolves the workspace id", async () => {
    const fetch = mockFetch({ data: { publicSiteConfig: siteConfig } });
    expect(await resolveWorkspaceId(config, { fetch })).toBe("w1");
  });

  it("throws when the workspace id can't be resolved", async () => {
    const fetch = mockFetch({ data: { publicSiteConfig: null } });
    await expect(resolveWorkspaceId(config, { fetch })).rejects.toThrow(
      /could not resolve workspaceId/,
    );
  });
});

describe("fetchForm / submitForm", () => {
  it("fetches a form by id", async () => {
    const fetch = mockFetch({
      data: {
        publicForm: {
          id: "f1",
          name: "Contact",
          slug: "contact",
          description: null,
          fields: [{ id: "fld1", name: "email", fieldType: "email" }],
          settings: { actionType: "contact", requireLogin: false },
        },
      },
    });
    const form = await fetchForm(config, "f1", { fetch, workspaceId: "w1" });
    expect(form?.name).toBe("Contact");
    expect(form?.fields[0]?.fieldType).toBe("email");
  });

  it("returns null for a missing form", async () => {
    const fetch = mockFetch({ data: { publicForm: null } });
    expect(
      await fetchForm(config, "x", { fetch, workspaceId: "w1" }),
    ).toBeNull();
  });

  it("scopes the form read with an x-workspace-id header", async () => {
    let sentHeaders: Record<string, string> = {};
    const fetch: FetchLike = async (_url, init) => {
      sentHeaders = init.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { publicForm: null } }),
      };
    };
    await fetchForm(config, "f1", { fetch, workspaceId: "w1" });
    expect(sentHeaders["x-workspace-id"]).toBe("w1");
  });

  it("resolves the workspace id via site config when not provided", async () => {
    let call = 0;
    const fetch: FetchLike = async (_url, init) => {
      call += 1;
      const headers = init.headers;
      return {
        ok: true,
        status: 200,
        json: async () =>
          call === 1
            ? { data: { publicSiteConfig: { id: "sc", workspaceId: "w7" } } }
            : (expect(headers["x-workspace-id"]).toBe("w7"),
              { data: { publicForm: null } }),
      };
    };
    await fetchForm(config, "f1", { fetch });
    expect(call).toBe(2);
  });

  it("submits with data + honeypot website, returns the response", async () => {
    const { fetch, bodies } = capturingFetch({
      data: {
        submitForm: {
          success: true,
          message: "Thanks",
          submissionId: "s1",
          redirectUrl: null,
          accessToken: null,
          customer: null,
        },
      },
    });
    const res = await submitForm(
      config,
      "f1",
      { email: "a@b.com" },
      { fetch, website: "" },
    );
    expect(res.success).toBe(true);
    expect(res.submissionId).toBe("s1");
    expect(bodies[0]?.variables).toEqual({
      formId: "f1",
      input: { data: { email: "a@b.com" }, website: "" },
    });
  });

  it("propagates a GraphQL error", async () => {
    const fetch = mockFetch({ errors: [{ message: "boom" }] });
    await expect(submitForm(config, "f1", {}, { fetch })).rejects.toThrow(
      /boom/,
    );
  });
});

describe("fetchModelDefinitions / fetchRecords", () => {
  it("uses an explicit workspaceId without resolving", async () => {
    const { fetch, bodies } = capturingFetch({
      data: {
        publicModelDefinitions: [{ id: "m1", name: "Posts", slug: "posts" }],
      },
    });
    const models = await fetchModelDefinitions(config, {
      fetch,
      workspaceId: "w1",
    });
    expect(models[0]?.slug).toBe("posts");
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.variables.workspaceId).toBe("w1");
  });

  it("resolves the workspaceId via site config when not provided", async () => {
    let call = 0;
    const fetch: FetchLike = async () => {
      call += 1;
      return {
        ok: true,
        status: 200,
        json: async () =>
          call === 1
            ? { data: { publicSiteConfig: { id: "sc", workspaceId: "w9" } } }
            : { data: { publicModelDefinitions: [] } },
      };
    };
    const models = await fetchModelDefinitions(config, { fetch });
    expect(models).toEqual([]);
    expect(call).toBe(2);
  });

  it("passes filter/sort/limit/offset/populate to the records query", async () => {
    const { fetch, bodies } = capturingFetch({
      data: {
        publicModelRecords: {
          items: [
            {
              id: "r1",
              modelId: "m1",
              data: { title: "Hello" },
              status: "published",
              createdAt: null,
              updatedAt: null,
            },
          ],
          total: 1,
          hasMore: false,
        },
      },
    });
    const result = await fetchRecords(config, "posts", {
      fetch,
      workspaceId: "w1",
      filter: { status: "published" },
      sort: "-createdAt",
      limit: 10,
      offset: 5,
      populate: ["author"],
    });
    expect(result.total).toBe(1);
    expect(result.items[0]?.data.title).toBe("Hello");
    expect(bodies[0]?.variables).toMatchObject({
      workspaceId: "w1",
      modelSlug: "posts",
      filter: { status: "published" },
      sort: "-createdAt",
      limit: 10,
      offset: 5,
      populate: ["author"],
    });
  });

  it("returns an empty list when records are absent", async () => {
    const fetch = mockFetch({ data: { publicModelRecords: null } });
    const result = await fetchRecords(config, "posts", {
      fetch,
      workspaceId: "w1",
    });
    expect(result).toEqual({ items: [], total: 0, hasMore: false });
  });
});
