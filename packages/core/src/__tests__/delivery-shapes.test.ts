import { beforeEach, describe, expect, it } from "vitest";
import {
  fetchLayouts,
  fetchPage,
  type CmssyLayoutGroup,
  type CmssyPageData,
  type FetchLike,
  type RawBlock,
  type RawLayoutBlock,
} from "../content/content-client";
import { createCmssyClient } from "../data/client";
import {
  MODEL_RECORDS_QUERY,
  SUBMIT_FORM_MUTATION,
  type CmssyFormSubmitResponse,
  type CmssyModelRecord,
  type CmssyRecordList,
  type CmssySiteConfig,
} from "../data/queries";
import { clearWorkspaceIdCache } from "../data/settings-client";

const config = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "ws",
};

const BLOCK = {
  id: "b1",
  type: "hero",
  content: { heading: { en: "Welcome" } },
  style: { padding: "lg" },
  advanced: { anchor: "top" },
} satisfies RawBlock;

const PAGE = {
  id: "p1",
  slug: "pricing",
  pageType: "landing",
  blocks: [BLOCK],
} satisfies CmssyPageData;

const LAYOUT_BLOCK = {
  id: "lb1",
  type: "site-header",
  content: { logo: "/logo.svg" },
  style: { sticky: true },
  advanced: { zIndex: 40 },
  order: 0,
  isActive: true,
} satisfies RawLayoutBlock;

const LAYOUT_GROUP = {
  region: "header",
  blocks: [LAYOUT_BLOCK],
  settings: { width: "full" },
} satisfies CmssyLayoutGroup;

const SITE_CONFIG = {
  id: "sc1",
  workspaceId: "w7",
  siteName: { en: "Acme" },
  defaultLanguage: "en",
  enabledLanguages: ["en", "pl"],
  enabledFeatures: ["forms", "commerce"],
  notFoundPageId: "p404",
  previewUrl: "https://acme.test",
  branding: {
    brandName: "Acme",
    logoUrl: "/logo.svg",
    logoDarkUrl: "/logo-dark.svg",
    faviconUrl: "/favicon.ico",
    ogImageUrl: "/og.png",
  },
} satisfies CmssySiteConfig;

const RECORD = {
  id: "r1",
  modelId: "m1",
  data: { title: "Chair" },
  status: "published",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-01T00:00:00.000Z",
} satisfies CmssyModelRecord;

const RECORD_LIST = {
  items: [RECORD],
  total: 1,
  hasMore: false,
} satisfies CmssyRecordList;

const SUBMIT_RESPONSE = {
  success: true,
  message: "Thanks",
  submissionId: "s1",
  redirectUrl: "/thank-you",
} satisfies CmssyFormSubmitResponse;

function mockFetch(payload: unknown): FetchLike {
  return async () => ({ ok: true, status: 200, json: async () => payload });
}

beforeEach(() => clearWorkspaceIdCache());

describe("a complete delivery payload survives the read that returns it", () => {
  it("hands back every member of a page and of its blocks", async () => {
    const fetch = mockFetch({
      data: {
        public: {
          page: {
            get: {
              id: PAGE.id,
              slug: PAGE.slug,
              pageType: PAGE.pageType,
              blocks: [],
              publishedBlocks: PAGE.blocks,
            },
          },
        },
      },
    });

    const page = await fetchPage(config, ["pricing"], { fetch });

    expect(page).toEqual(PAGE);
    expect(page?.blocks[0]).toEqual(BLOCK);
  });

  it("hands back every member of a layout group and of its blocks", async () => {
    const fetch = mockFetch({
      data: { public: { page: { layouts: [LAYOUT_GROUP] } } },
    });

    const groups = await fetchLayouts(config, ["pricing"], { fetch });

    expect(groups).toEqual([LAYOUT_GROUP]);
    expect(groups[0]?.blocks[0]).toEqual(LAYOUT_BLOCK);
  });

  it("reads the workspace id off a full site config", async () => {
    const fetch = mockFetch({
      data: { public: { siteConfig: SITE_CONFIG } },
    });

    const client = createCmssyClient(config);

    expect(await client.resolveWorkspaceId({ fetch })).toBe(
      SITE_CONFIG.workspaceId,
    );
  });

  it("hands back every member of a model record", async () => {
    const fetch = mockFetch({
      data: { public: { model: { records: RECORD_LIST } } },
    });

    const client = createCmssyClient(config);
    const data = await client.queryScoped<{
      public: { model: { records: CmssyRecordList } };
    }>(
      MODEL_RECORDS_QUERY,
      { modelSlug: "products" },
      { fetch, workspaceId: SITE_CONFIG.workspaceId },
    );

    expect(data.public.model.records).toEqual(RECORD_LIST);
    expect(data.public.model.records.items[0]).toEqual(RECORD);
  });

  it("hands back every member of a form submit response", async () => {
    const fetch = mockFetch({
      data: { public: { form: { submit: SUBMIT_RESPONSE } } },
    });

    const client = createCmssyClient(config);
    const data = await client.query<{
      public: { form: { submit: CmssyFormSubmitResponse } };
    }>(
      SUBMIT_FORM_MUTATION,
      { formId: "f1", input: { data: { reason: "warranty" } } },
      { fetch },
    );

    expect(data.public.form.submit).toEqual(SUBMIT_RESPONSE);
  });
});
