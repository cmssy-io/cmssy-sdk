import { describe, it, expect } from "vitest";
import {
  localizeHref,
  buildLocaleSwitchHref,
  localizeHtmlLinks,
  isExternalHref,
} from "../data/localize-href";
import type { CmssyLocaleContext } from "../components/block-context";

const en: CmssyLocaleContext = {
  current: "en",
  default: "pl",
  enabled: ["pl", "en"],
};
const pl: CmssyLocaleContext = {
  current: "pl",
  default: "pl",
  enabled: ["pl", "en"],
};

describe("localizeHref", () => {
  it("prefixes an internal path with the active non-default locale", () => {
    expect(localizeHref("/about", en)).toBe("/en/about");
  });

  it("leaves the default locale bare (no prefix)", () => {
    expect(localizeHref("/about", pl)).toBe("/about");
  });

  it("prefixes the root path", () => {
    expect(localizeHref("/", en)).toBe("/en");
  });

  it("does not double-prefix an already localized href", () => {
    expect(localizeHref("/en/about", en)).toBe("/en/about");
  });

  it("re-targets a localized href to the active locale", () => {
    expect(localizeHref("/en/about", pl)).toBe("/about");
  });

  it("preserves query and hash", () => {
    expect(localizeHref("/about?x=1#top", en)).toBe("/en/about?x=1#top");
  });

  it.each([
    "https://x.com",
    "http://x.com",
    "mailto:a@b.c",
    "tel:+48",
    "//cdn",
  ])("leaves external href %s untouched", (href) => {
    expect(localizeHref(href, en)).toBe(href);
  });

  it("leaves a pure fragment untouched", () => {
    expect(localizeHref("#section", en)).toBe("#section");
  });

  it("leaves a relative path untouched", () => {
    expect(localizeHref("about", en)).toBe("about");
  });

  it("localizes a path with surrounding whitespace", () => {
    expect(localizeHref("  /about  ", en)).toBe("/en/about");
  });
});

describe("buildLocaleSwitchHref", () => {
  it("switches a bare path to a non-default locale", () => {
    expect(buildLocaleSwitchHref("en", "/about", en)).toBe("/en/about");
  });

  it("switches a localized path back to default (drops prefix)", () => {
    expect(buildLocaleSwitchHref("pl", "/en/about", en)).toBe("/about");
  });

  it("handles the root path", () => {
    expect(buildLocaleSwitchHref("en", "/", en)).toBe("/en");
    expect(buildLocaleSwitchHref("pl", "/en", en)).toBe("/");
  });
});

describe("localizeHtmlLinks", () => {
  it("rewrites every anchor href in markup", () => {
    const html = '<p><a href="/about">a</a> <a href="https://x.com">b</a></p>';
    expect(localizeHtmlLinks(html, en)).toBe(
      '<p><a href="/en/about">a</a> <a href="https://x.com">b</a></p>',
    );
  });

  it("rewrites an anchor whose earlier attribute contains '>'", () => {
    const html = '<a title="a>b" href="/c">x</a>';
    expect(localizeHtmlLinks(html, en)).toBe(
      '<a title="a>b" href="/en/c">x</a>',
    );
  });
});

describe("isExternalHref", () => {
  it("flags external, fragment and empty hrefs", () => {
    expect(isExternalHref("https://x.com")).toBe(true);
    expect(isExternalHref("#x")).toBe(true);
    expect(isExternalHref("")).toBe(true);
    expect(isExternalHref("/about")).toBe(false);
  });
});
