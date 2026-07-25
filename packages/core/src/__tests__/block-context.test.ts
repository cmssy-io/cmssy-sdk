import { describe, it, expect } from "vitest";
import { buildBlockContext } from "../block-context";

describe("buildBlockContext", () => {
  it("uses the provided enabled locales", () => {
    const ctx = buildBlockContext("pl", "en", ["en", "pl", "de"]);
    expect(ctx.locale).toEqual({
      current: "pl",
      default: "en",
      enabled: ["en", "pl", "de"],
    });
  });

  it("falls back to current + default when enabled locales are omitted", () => {
    const ctx = buildBlockContext("fr", "en");
    expect(ctx.locale?.enabled).toEqual(["en", "fr"]);
  });

  it("dedupes the fallback when current equals default", () => {
    const ctx = buildBlockContext("en", "en", []);
    expect(ctx.locale?.enabled).toEqual(["en"]);
  });

  it("defaults isPreview to false and passes it through", () => {
    expect(buildBlockContext("en", "en").isPreview).toBe(false);
    expect(buildBlockContext("en", "en", undefined, true).isPreview).toBe(true);
  });

  it("omits auth, workspace and page when no extra is provided", () => {
    const ctx = buildBlockContext("en", "en");
    expect("auth" in ctx).toBe(false);
    expect("workspace" in ctx).toBe(false);
    expect("page" in ctx).toBe(false);
  });

  it("injects auth and workspace from the extra argument", () => {
    const ctx = buildBlockContext("en", "en", undefined, false, undefined, {
      auth: {
        isAuthenticated: true,
        member: { recordId: "rec_1", email: "a@b.com" },
      },
      workspace: { id: "ws_1", slug: "acme" },
    });
    expect(ctx.auth).toEqual({
      isAuthenticated: true,
      member: { recordId: "rec_1", email: "a@b.com" },
    });
    expect(ctx.workspace).toEqual({ id: "ws_1", slug: "acme" });
  });

  it("keeps the page's identity and drops the rest", () => {
    const ctx = buildBlockContext("en", "en", undefined, false, undefined, {
      page: {
        id: "page_1",
        slug: "/docs/blocks",
        pageType: "page",
        blocks: [{ id: "b1", type: "hero", content: {} }],
      },
    });
    expect(ctx.page).toEqual({
      id: "page_1",
      slug: "/docs/blocks",
      pageType: "page",
    });
  });

  it("reports no page rather than one without a slug", () => {
    // A page built by hand, or fetched by an older SDK: identity is unknown,
    // and a block must be able to tell that apart from "I am at /".
    const ctx = buildBlockContext("en", "en", undefined, false, undefined, {
      page: { id: "page_1", blocks: [] },
    });
    expect("page" in ctx).toBe(false);
  });

  it("normalizes a missing page type to null", () => {
    const ctx = buildBlockContext("en", "en", undefined, false, undefined, {
      page: { id: "p", slug: "/", blocks: [] },
    });
    expect(ctx.page?.pageType).toBeNull();
  });

  it("passes the app channel through untouched", () => {
    const app = { member: { id: "m1" }, flags: { beta: true }, path: "/x" };
    const ctx = buildBlockContext("en", "en", undefined, false, undefined, {
      app,
    });
    expect(ctx.app).toBe(app);
  });

  it("omits the app channel when the app passes nothing", () => {
    expect("app" in buildBlockContext("en", "en")).toBe(false);
  });
});
