import { describe, it, expect } from "vitest";
import type { FetchLike } from "../content/content-client";
import { fields, type InferBlockContent } from "../fields";
import {
  RECORDS_BY_IDS_QUERY,
  normalizeBlockContent,
  resolveRelationContent,
  type BlockSchemaMap,
} from "../data/block-content";

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
    expect(
      calls.filter((c) => c.query.includes("PublicModelRecords")),
    ).toHaveLength(1);
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

  it("normalizeBlockContent coerces raw editor values to safe shapes", () => {
    const schema = {
      items: fields.relation({ model: "faq-item", mode: "all" }),
      pick: fields.relation({ model: "testimonial", multiple: true }),
      author: fields.relation({ model: "author" }),
    };
    const resolved = record("a1", { name: "Ann" });
    const content: Record<string, unknown> = {
      items: "",
      pick: ["raw-id", resolved],
      author: "raw-id",
      heading: "Untouched",
    };
    normalizeBlockContent(content, schema);
    expect(content.items).toEqual([]);
    expect(content.pick).toEqual([resolved]);
    expect(content).not.toHaveProperty("author");
    expect(content.heading).toBe("Untouched");

    const kept: Record<string, unknown> = { author: resolved };
    normalizeBlockContent(kept, schema);
    expect(kept.author).toBe(resolved);
  });

  it("normalizeBlockContent falls back to server-resolved values when raw content clobbers them", () => {
    const schema = {
      items: fields.relation({ model: "faq-item", mode: "all" }),
      author: fields.relation({ model: "author" }),
    };
    const faq = record("f1", { question: "Q" });
    const ann = record("a1", { name: "Ann" });
    const resolved = { items: [faq], author: ann };

    const clobbered: Record<string, unknown> = {
      items: [{ question: "stale repeater row" }],
      author: "raw-id",
    };
    normalizeBlockContent(clobbered, schema, resolved);
    expect(clobbered.items).toEqual([faq]);
    expect(clobbered.author).toBe(ann);

    const cleared: Record<string, unknown> = { items: [], author: null };
    normalizeBlockContent(cleared, schema, resolved);
    expect(cleared.items).toEqual([]);
    expect(cleared).not.toHaveProperty("author");
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

describe("fields nested in a repeater", () => {
  const schemas: BlockSchemaMap = {
    "site-header": {
      navCategories: fields.repeater({
        label: "Nav",
        itemSchema: {
          label: fields.text(),
          category: fields.relation({ model: "category" }),
        },
      }),
    },
  };

  it("resolves a relation declared inside a repeater row", async () => {
    const { fetch, calls } = routerFetch({
      byIds: () => [record("c1", { name: "Pumps" })],
    });
    const content: Record<string, unknown> = {
      navCategories: [{ label: "Pumps", category: "c1" }],
    };

    await resolveRelationContent(
      config,
      [{ type: "site-header", content }],
      schemas,
      "en",
      { fetch, workspaceId: "ws1" },
    );

    expect(calls).toHaveLength(1);
    expect(content.navCategories).toEqual([
      { label: "Pumps", category: record("c1", { name: "Pumps" }) },
    ]);
  });

  it("copies rows instead of writing through to the stored content", async () => {
    const { fetch } = routerFetch({
      byIds: () => [record("c1", { name: "Pumps" })],
    });
    const storedRow = { label: "Pumps", category: "c1" };
    const content: Record<string, unknown> = { navCategories: [storedRow] };

    await resolveRelationContent(
      config,
      [{ type: "site-header", content }],
      schemas,
      "en",
      { fetch, workspaceId: "ws1" },
    );

    expect(storedRow.category).toBe("c1");
  });

  it("normalizes a repeater-nested relation against the resolved fallback", () => {
    const cat = record("c1", { name: "Pumps" });
    const content: Record<string, unknown> = {
      navCategories: [{ category: "c1" }],
    };
    normalizeBlockContent(content, schemas["site-header"]!, {
      navCategories: [{ category: cat }],
    });
    expect(content.navCategories).toEqual([{ category: cat }]);
  });

  it("drops an unresolvable repeater-nested relation rather than leaving an id", () => {
    const content: Record<string, unknown> = {
      navCategories: [{ label: "Pumps", category: "c1" }],
    };
    normalizeBlockContent(content, schemas["site-header"]!);
    expect(content.navCategories).toEqual([{ label: "Pumps" }]);
  });
});

describe("pageSelector normalization", () => {
  const single = { parentPage: fields.pageSelector({ multiple: false }) };
  const many = { pages: fields.pageSelector() };

  it("unwraps the stored one-element list when the field is single", () => {
    const content: Record<string, unknown> = {
      parentPage: [{ slug: "blog", displayName: { en: "Blog" } }],
    };
    normalizeBlockContent(content, single);
    expect(content.parentPage).toEqual({
      slug: "blog",
      displayName: { en: "Blog" },
    });
  });

  it("drops a single page selector that holds nothing", () => {
    const content: Record<string, unknown> = { parentPage: [] };
    normalizeBlockContent(content, single);
    expect(content).not.toHaveProperty("parentPage");
  });

  it("keeps a list for the default multiple selector, mixed shapes and all", () => {
    const content: Record<string, unknown> = {
      pages: ["a", { slug: "b", displayName: { en: "B" } }, "", null],
    };
    normalizeBlockContent(content, many);
    expect(content.pages).toEqual([
      { slug: "a", displayName: {} },
      { slug: "b", displayName: { en: "B" } },
    ]);
  });

  it("reads the legacy bare-slug shape as a page reference", () => {
    const content: Record<string, unknown> = { parentPage: ["blog"] };
    normalizeBlockContent(content, single);
    expect(content.parentPage).toEqual({ slug: "blog", displayName: {} });
  });

  it("is idempotent, so a second render does not re-wrap", () => {
    const content: Record<string, unknown> = { parentPage: ["blog"] };
    normalizeBlockContent(content, single);
    normalizeBlockContent(content, single);
    expect(content.parentPage).toEqual({ slug: "blog", displayName: {} });
  });

  it("leaves an untouched selector absent rather than inventing a value", () => {
    const content: Record<string, unknown> = {};
    normalizeBlockContent(content, single);
    normalizeBlockContent(content, many);
    expect(content).toEqual({});
  });

  it("reaches a page selector declared inside a repeater row", () => {
    const schema = {
      links: fields.repeater({
        label: "Links",
        itemSchema: { target: fields.pageSelector({ multiple: false }) },
      }),
    };
    const content: Record<string, unknown> = {
      links: [{ target: [{ slug: "about", displayName: {} }] }],
    };
    normalizeBlockContent(content, schema);
    expect(content.links).toEqual([
      { target: { slug: "about", displayName: {} } },
    ]);
  });
});

describe("declared defaults", () => {
  it("puts a default in place when the author left the field empty", () => {
    const schema = {
      limit: fields.number({ defaultValue: 8 }),
      heading: fields.text({ defaultValue: "Popular" }),
    };
    const content: Record<string, unknown> = { limit: null };
    normalizeBlockContent(content, schema);
    expect(content).toEqual({ limit: 8, heading: "Popular" });
  });

  it("does not overwrite a value the author actually set, including a blank", () => {
    const schema = {
      limit: fields.number({ defaultValue: 8 }),
      heading: fields.text({ defaultValue: "Popular" }),
      flag: fields.boolean({ defaultValue: true }),
    };
    const content: Record<string, unknown> = {
      limit: 0,
      heading: "",
      flag: false,
    };
    normalizeBlockContent(content, schema);
    expect(content).toEqual({ limit: 0, heading: "", flag: false });
  });

  it("defaults a field declared inside a repeater row", () => {
    const schema = {
      rows: fields.repeater({
        label: "Rows",
        itemSchema: { icon: fields.text({ defaultValue: "star" }) },
      }),
    };
    const content: Record<string, unknown> = { rows: [{}, { icon: "mail" }] };
    normalizeBlockContent(content, schema);
    expect(content.rows).toEqual([{ icon: "star" }, { icon: "mail" }]);
  });

  it("leaves a field without a declared default absent", () => {
    const content: Record<string, unknown> = {};
    normalizeBlockContent(content, { heading: fields.text() });
    expect(content).toEqual({});
  });
});

describe("a page selector's declared default", () => {
  const single = {
    parentPage: fields.pageSelector({
      multiple: false,
      defaultValue: [{ slug: "blog", displayName: { en: "Blog" } }],
    }),
  };
  const many = {
    pages: fields.pageSelector({ defaultValue: ["a", "b"] }),
  };

  it("arrives in the shape the field declares, not as the raw default", () => {
    const content: Record<string, unknown> = {};
    normalizeBlockContent(content, single);
    expect(content.parentPage).toEqual({
      slug: "blog",
      displayName: { en: "Blog" },
    });
  });

  it("is restored when the editor cleared the selector to null", () => {
    const content: Record<string, unknown> = { pages: null };
    normalizeBlockContent(content, many);
    expect(content.pages).toEqual([
      { slug: "a", displayName: {} },
      { slug: "b", displayName: {} },
    ]);
  });

  it("gives way to a page the author actually picked", () => {
    const content: Record<string, unknown> = {
      parentPage: [{ slug: "news", displayName: {} }],
    };
    normalizeBlockContent(content, single);
    expect(content.parentPage).toEqual({ slug: "news", displayName: {} });
  });
});

describe("fields the editor stores outside content", () => {
  const schema = {
    heading: fields.text({ defaultValue: "Hi" }),
    width: fields.select({
      label: "Width",
      options: ["full", "narrow"],
      defaultValue: "full",
      tab: "style",
    }),
    target: fields.pageSelector({ multiple: false, tab: "advanced" }),
  };

  it("leaves a style-tab default out of the content bucket", () => {
    const content: Record<string, unknown> = {};
    normalizeBlockContent(content, schema);
    expect(content).toEqual({ heading: "Hi" });
    expect(content).not.toHaveProperty("width");
  });

  it("does not coerce an advanced-tab selector inside content", () => {
    const content: Record<string, unknown> = { target: ["stale"] };
    normalizeBlockContent(content, schema);
    expect(content.target).toEqual(["stale"]);
  });

  it("does not fetch for a relation declared on the advanced tab", async () => {
    const { fetch, calls } = routerFetch({ records: () => [] });
    const content: Record<string, unknown> = {};
    await resolveRelationContent(
      config,
      [{ type: "promo", content }],
      {
        promo: {
          items: fields.relation({
            model: "testimonial",
            mode: "all",
            tab: "advanced",
          }),
        },
      },
      "en",
      { fetch, workspaceId: "ws1" },
    );
    expect(calls).toHaveLength(0);
    expect(content).toEqual({});
  });
});

describe("a cleared multiple page selector", () => {
  it("normalizes null to an empty list rather than leaving it raw", () => {
    const content: Record<string, unknown> = { pages: null };
    normalizeBlockContent(content, { pages: fields.pageSelector() });
    expect(content.pages).toEqual([]);
  });
});

type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

const maybeDefault = process.env.CMSSY_TEST_DEFAULT;

// A literal default is guaranteed by normalization, so the key is not optional.
type _LiteralDefaultIsPresent = Expect<
  Equals<
    InferBlockContent<{ limit: ReturnType<typeof numberWithDefault> }>,
    { limit: number }
  >
>;

// One that may be undefined is not: normalization skips an undefined default,
// so promising the key would be a lie.
type _MaybeUndefinedDefaultIsOptional = Expect<
  Equals<
    InferBlockContent<{ heading: ReturnType<typeof textWithMaybeDefault> }>,
    { heading?: string }
  >
>;

function numberWithDefault() {
  return fields.number({ defaultValue: 8 });
}
function textWithMaybeDefault() {
  return fields.text({ defaultValue: maybeDefault });
}
