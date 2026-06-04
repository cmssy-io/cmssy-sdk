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
  isCmssyEditMode,
  isCmssyEditRequest,
} from "../edit-mode";

function makeRequest(opts: { cmssyEdit?: string[]; draftCookie?: boolean }) {
  return {
    cookies: {
      has: (name: string) =>
        name === "__prerender_bypass" && !!opts.draftCookie,
    },
    nextUrl: {
      searchParams: {
        getAll: (name: string) =>
          name === "cmssyEdit" ? (opts.cmssyEdit ?? []) : [],
      },
    },
  };
}

describe("isCmssyEditRequest", () => {
  it("detects the cmssyEdit=1 query param", () => {
    expect(isCmssyEditRequest(makeRequest({ cmssyEdit: ["1"] }))).toBe(true);
  });

  it("detects the draft-mode cookie", () => {
    expect(isCmssyEditRequest(makeRequest({ draftCookie: true }))).toBe(true);
  });

  it("is false for a plain public request", () => {
    expect(isCmssyEditRequest(makeRequest({}))).toBe(false);
    expect(isCmssyEditRequest(makeRequest({ cmssyEdit: ["0"] }))).toBe(false);
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

  it("pins the forwarded header name", () => {
    expect(CMSSY_EDIT_HEADER).toBe("x-cmssy-edit");
  });
});
