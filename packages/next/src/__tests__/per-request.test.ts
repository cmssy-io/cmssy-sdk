import * as React from "react";
import { describe, expect, it } from "vitest";
import { perRequest, resolvePerRequest } from "../per-request";

describe("perRequest (CMS-2048)", () => {
  it("uses React's cache when the installed React has one", () => {
    expect(typeof (React as { cache?: unknown }).cache).toBe("function");
    expect(resolvePerRequest((React as { cache?: unknown }).cache)).toBe(
      (React as { cache?: unknown }).cache,
    );
  });

  it("falls back to no scope on a React that predates cache, rather than throwing at import", () => {
    const scoped = resolvePerRequest(undefined);
    const make = scoped(() => new Map());

    expect(make()).toBeInstanceOf(Map);
    expect(make()).not.toBe(make());
  });

  it("is a function on whatever React this package resolved", () => {
    expect(typeof perRequest).toBe("function");
    expect(typeof perRequest(() => new Map())).toBe("function");
  });
});
