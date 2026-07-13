import { describe, expect, it, vi } from "vitest";

const { headerStore } = vi.hoisted(() => ({
  headerStore: { value: null as string | null },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => (name === "x-cmssy-edit" ? headerStore.value : null),
  })),
}));

import {
  CMSSY_EDIT_HEADER,
  CMSSY_EDIT_QUERY_PARAM,
  CMSSY_SECRET_QUERY_PARAM,
  isCmssyEditMode,
  isCmssyEditRequest,
} from "../edit-mode";

const CONFIG = { draftSecret: "test-draft-secret-123" };

function makeRequest(opts: {
  cmssyEdit?: string[];
  cmssySecret?: string;
  draftCookie?: boolean;
}) {
  return {
    cookies: {
      has: (name: string) =>
        name === "__prerender_bypass" && !!opts.draftCookie,
    },
    nextUrl: {
      searchParams: {
        getAll: (name: string) =>
          name === "cmssyEdit" ? (opts.cmssyEdit ?? []) : [],
        get: (name: string) =>
          name === "cmssySecret" ? (opts.cmssySecret ?? null) : null,
      },
    },
  };
}

describe("isCmssyEditRequest (CMS-948)", () => {
  it("accepts cmssyEdit=1 with a matching cmssySecret", async () => {
    expect(
      await isCmssyEditRequest(
        makeRequest({ cmssyEdit: ["1"], cmssySecret: CONFIG.draftSecret }),
        CONFIG,
      ),
    ).toBe(true);
  });

  it("rejects a bare cmssyEdit=1 without a secret", async () => {
    expect(
      await isCmssyEditRequest(makeRequest({ cmssyEdit: ["1"] }), CONFIG),
    ).toBe(false);
  });

  it("rejects cmssyEdit=1 with a wrong secret", async () => {
    expect(
      await isCmssyEditRequest(
        makeRequest({ cmssyEdit: ["1"], cmssySecret: "wrong" }),
        CONFIG,
      ),
    ).toBe(false);
  });

  it("rejects when the site has no draft secret configured", async () => {
    expect(
      await isCmssyEditRequest(
        makeRequest({ cmssyEdit: ["1"], cmssySecret: "anything" }),
        { draftSecret: "" },
      ),
    ).toBe(false);
  });

  it("accepts the draft-mode cookie without any query params", async () => {
    expect(
      await isCmssyEditRequest(makeRequest({ draftCookie: true }), CONFIG),
    ).toBe(true);
  });

  it("ignores a secret without the cmssyEdit flag", async () => {
    expect(
      await isCmssyEditRequest(
        makeRequest({ cmssySecret: CONFIG.draftSecret }),
        CONFIG,
      ),
    ).toBe(false);
    expect(
      await isCmssyEditRequest(
        makeRequest({ cmssyEdit: ["0"], cmssySecret: CONFIG.draftSecret }),
        CONFIG,
      ),
    ).toBe(false);
  });
});

describe("isCmssyEditMode", () => {
  it("is true when middleware forwarded the edit header", async () => {
    headerStore.value = "1";
    expect(await isCmssyEditMode()).toBe(true);
  });

  it("is false when the header is absent", async () => {
    headerStore.value = null;
    expect(await isCmssyEditMode()).toBe(false);
  });

  it("pins the forwarded header and query param names", () => {
    expect(CMSSY_EDIT_HEADER).toBe("x-cmssy-edit");
    expect(CMSSY_EDIT_QUERY_PARAM).toBe("cmssyEdit");
    expect(CMSSY_SECRET_QUERY_PARAM).toBe("cmssySecret");
  });
});
