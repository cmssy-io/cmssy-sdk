import { describe, expect, it, vi } from "vitest";

const useMatches = vi.hoisted(() => vi.fn());
vi.mock("react-router", () => ({ useMatches }));

import { useCmssyLocale } from "../use-cmssy-locale";

const match = (loaderData: unknown) => ({
  id: "x",
  pathname: "/",
  params: {},
  loaderData,
});

const v7Match = (data: unknown) => ({ id: "x", pathname: "/", params: {}, data });

describe("useCmssyLocale", () => {
  it("reads the locale the cmssy route resolved", () => {
    useMatches.mockReturnValue([match(undefined), match({ locale: "no" })]);

    expect(useCmssyLocale()).toBe("no");
  });

  it("prefers the deepest match, not the first one carrying a locale", () => {
    useMatches.mockReturnValue([match({ locale: "en" }), match({ locale: "no" })]);

    expect(useCmssyLocale()).toBe("no");
  });

  it("names no language when no route resolved one", () => {
    useMatches.mockReturnValue([match(undefined)]);

    expect(useCmssyLocale()).toBeUndefined();
  });

  it("reads React Router 7's `data` as well as 8's `loaderData`", () => {
    useMatches.mockReturnValue([v7Match({ locale: "no" })]);

    expect(useCmssyLocale()).toBe("no");
  });

  it("ignores a match whose locale is not a usable string", () => {
    useMatches.mockReturnValue([match({ locale: "" }), match({ locale: 42 })]);

    expect(useCmssyLocale()).toBeUndefined();
  });
});
