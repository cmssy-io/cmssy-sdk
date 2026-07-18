import { describe, it, expect } from "vitest";
import type { FetchLike } from "../content/content-client";
import { fields } from "../fields";
import {
  RECORDS_BY_IDS_QUERY,
  resolveRelationContent,
  type BlockSchemaMap,
} from "../data/relation-resolver";

const config = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "ws",
};

function record(id: string, data: Record<string, unknown>) {
  return {
    id,
    modelId: "m1",
    data,
    status: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function routerFetch(handlers: {
  byIds?: (variables: Record<string, unknown>) => unknown[];
  records?: (variables: Record<string, unknown>) => unknown[];
}): {
  fetch: FetchLike;
  calls: Array<{ query: string; variables: Record<string, unknown> }>;
} {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> =
    [];
  const fetch: FetchLike = async (_url, init) => {
    const body = JSON.parse(init.body) as {
      query: string;
      variables: Record<string, unknown>;
    };
    calls.push(body);
    let data: unknown;
    if (body.query.includes("recordsByIds")) {
      data = {
        public: {
          model: { recordsByIds: handlers.byIds?.(body.variables) ?? [] },
        },
      };
    } else {
      data = {
        public: {
          model: {
            records: {
              items: handlers.records?.(body.variables) ?? [],
              total: 0,
              hasMore: false,
            },
          },
        },
      };
    }
    return { ok: true, status: 200, json: async () => ({ data }) };
  };
  return { fetch, calls };
}

describe("fields.relation builder", () => {
  it("emits the canonical wire shape for a collection binding", () => {
    const field = fields.relation({
      model: "testimonial",
      mode: "all",
      sort: "-createdAt",
      limit: 6,
    });
    expect(field).toMatchObject({
      type: "relation",
      relationTo: "model:testimonial",
      relationType: "hasMany",
      relationMode: "all",
      sort: "-createdAt",
      limit: 6,
    });
    expect(field).not.toHaveProperty("model");
    expect(field).not.toHaveProperty("mode");
  });

  it("emits picked mode with cardinality from multiple", () => {
    expect(fields.relation({ model: "author" })).toMatchObject({
      relationTo: "model:author",
      relationType: "hasOne",
      relationMode: "picked",
    });
    expect(fields.relation({ model: "author", multiple: true })).toMatchObject({
      relationType: "hasMany",
      relationMode: "picked",
    });
  });
});

describe("resolveRelationContent", () => {
  const schemas: BlockSchemaMap = {
    testimonials: {
      heading: fields.text(),
      items: fields.relation({ model: "testimonial", mode: "all" }),
    },
    featured: {
      pick: fields.relation({ model: "testimonial", multiple: true }),
      author: fields.relation({ model: "author" }),
    },
  };

  it("replaces picked ids with records in stored order, dropping dangling ids", async () => {
    const { fetch, calls } = routerFetch({
      byIds: () => [record("b", { name: "B" }), record("a", { name: "A" })],
    });
    const content: Record<string, unknown> = { pick: ["a", "gone", "b"] };
    await resolveRelationContent(
      config,
      [{ type: "featured", content }],
      schemas,
      "en",
      { fetch, workspaceId: "ws1" },
    );
    expect(
      (content.pick as Array<{ data: { name: string } }>).map(
        (r) => r.data.name,
      ),
    ).toEqual(["A", "B"]);
    expect(content).not.toHaveProperty("author");
    const byIdsCall = calls.find((c) => c.query === RECORDS_BY_IDS_QUERY);
    expect(byIdsCall?.variables.ids).toEqual(["a", "gone", "b"]);
  });

  it("resolves a single picked id to one record, removing it when dangling", async () => {
    const { fetch } = routerFetch({
      byIds: () => [record("a1", { name: "Ann" })],
    });
    const found: Record<string, unknown> = { author: "a1" };
    const dangling: Record<string, unknown> = { author: "gone" };
    await resolveRelationContent(
      config,
      [
        { type: "featured", content: found },
        { type: "featured", content: dangling },
      ],
      schemas,
      "en",
      { fetch, workspaceId: "ws1" },
    );
    expect(found.author).toMatchObject({ id: "a1", data: { name: "Ann" } });
    expect(dangling).not.toHaveProperty("author");
  });

  it("binds a mode:all field to the model's records with one fetch per distinct source", async () => {
    const { fetch, calls } = routerFetch({
      records: () => [record("t1", { quote: "Great" })],
    });
    const first: Record<string, unknown> = { heading: "Hi" };
    const second: Record<string, unknown> = {};
    await resolveRelationContent(
      config,
      [
        { type: "testimonials", content: first },
        { type: "testimonials", content: second },
      ],
      schemas,
      "en",
      { fetch, workspaceId: "ws1" },
    );
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(calls.filter((c) => c.query.includes("PublicModelRecords"))).toHaveLength(1);
  });

  it("degrades on fetch failure: lists become empty, singles disappear", async () => {
    const fetch: FetchLike = async () => {
      throw new Error("network down");
    };
    const content: Record<string, unknown> = { pick: ["a"], author: "a1" };
    const collection: Record<string, unknown> = {};
    await resolveRelationContent(
      config,
      [
        { type: "featured", content },
        { type: "testimonials", content: collection },
      ],
      schemas,
      "en",
      { fetch, workspaceId: "ws1" },
    );
    expect(content.pick).toEqual([]);
    expect(content).not.toHaveProperty("author");
    expect(collection.items).toEqual([]);
  });

  it("does not touch the network when no block declares a relation", async () => {
    const { fetch, calls } = routerFetch({});
    await resolveRelationContent(
      config,
      [{ type: "plain", content: { heading: "Hi" } }],
      { plain: { heading: fields.text() } },
      "en",
      { fetch, workspaceId: "ws1" },
    );
    expect(calls).toHaveLength(0);
  });
});
