import { describe, expect, it } from "vitest";
import { applyCmssyCsp, cmssyCspHeaders } from "../csp";

describe("cmssyCspHeaders", () => {
  it("emits frame-ancestors for a single origin", () => {
    expect(cmssyCspHeaders({ editorOrigin: "https://app.cmssy.io" })).toEqual({
      "Content-Security-Policy": "frame-ancestors https://app.cmssy.io",
    });
  });

  it("normalizes origins (drops path, trailing slash)", () => {
    expect(
      cmssyCspHeaders({ editorOrigin: "https://app.cmssy.io/editor/" }),
    ).toEqual({
      "Content-Security-Policy": "frame-ancestors https://app.cmssy.io",
    });
  });

  it("joins multiple origins", () => {
    expect(
      cmssyCspHeaders({
        editorOrigin: ["https://app.cmssy.io", "http://localhost:3000"],
      }),
    ).toEqual({
      "Content-Security-Policy":
        "frame-ancestors https://app.cmssy.io http://localhost:3000",
    });
  });

  it("preserves the wildcard", () => {
    expect(cmssyCspHeaders({ editorOrigin: "*" })).toEqual({
      "Content-Security-Policy": "frame-ancestors *",
    });
  });

  it("rejects an origin with header-injection characters", () => {
    expect(() =>
      cmssyCspHeaders({ editorOrigin: "https://app.cmssy.io; script-src *" }),
    ).toThrow(/invalid editorOrigin/);
  });

  it("falls back to the cmssy cloud admin origin when unset", () => {
    expect(cmssyCspHeaders({})).toEqual({
      "Content-Security-Policy":
        "frame-ancestors https://cmssy.io https://www.cmssy.io",
    });
  });

  it("falls back to the default for an empty origin list", () => {
    expect(cmssyCspHeaders({ editorOrigin: [] })).toEqual({
      "Content-Security-Policy":
        "frame-ancestors https://cmssy.io https://www.cmssy.io",
    });
  });

  it("trims surrounding whitespace before validating", () => {
    expect(
      cmssyCspHeaders({ editorOrigin: "  https://app.cmssy.io  " }),
    ).toEqual({
      "Content-Security-Policy": "frame-ancestors https://app.cmssy.io",
    });
  });
});

describe("applyCmssyCsp", () => {
  it("sets the CSP header and drops X-Frame-Options", () => {
    const response = { headers: new Headers({ "X-Frame-Options": "DENY" }) };
    applyCmssyCsp(response, { editorOrigin: "https://app.cmssy.io" });
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "frame-ancestors https://app.cmssy.io",
    );
    expect(response.headers.get("X-Frame-Options")).toBeNull();
  });

  it("applies multiple origins", () => {
    const response = { headers: new Headers() };
    applyCmssyCsp(response, {
      editorOrigin: ["https://app.cmssy.io", "http://localhost:3000"],
    });
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "frame-ancestors https://app.cmssy.io http://localhost:3000",
    );
  });

  it("preserves existing CSP directives when merging", () => {
    const response = {
      headers: new Headers({
        "Content-Security-Policy": "default-src 'self'; script-src 'self'",
      }),
    };
    applyCmssyCsp(response, { editorOrigin: "https://app.cmssy.io" });
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "default-src 'self'; script-src 'self'; frame-ancestors https://app.cmssy.io",
    );
  });

  it("replaces an existing frame-ancestors directive", () => {
    const response = {
      headers: new Headers({
        "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
      }),
    };
    applyCmssyCsp(response, { editorOrigin: "https://app.cmssy.io" });
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "default-src 'self'; frame-ancestors https://app.cmssy.io",
    );
  });
});
