import type { CmssyLocaleContext } from "../block-context";

const PROTOCOL_OR_RELATIVE = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

export function isExternalHref(href: string): boolean {
  const value = href.trim();
  if (!value) return true;
  if (value.startsWith("#")) return true;
  return PROTOCOL_OR_RELATIVE.test(value);
}

function stripLeadingLocale(path: string, locale: CmssyLocaleContext): string {
  const segments = path.split("/");
  const first = segments[1];
  if (first && first !== locale.default && locale.enabled.includes(first)) {
    segments.splice(1, 1);
    const rest = segments.join("/");
    return rest === "" ? "/" : rest;
  }
  return path;
}

function addLocalePrefix(
  path: string,
  target: string,
  locale: CmssyLocaleContext,
): string {
  if (target === locale.default) return path;
  if (path === "/") return `/${target}`;
  return `/${target}${path}`;
}

export function localizeHref(href: string, locale: CmssyLocaleContext): string {
  const value = href.trim();
  if (isExternalHref(value)) return href;
  const boundary = value.search(/[?#]/);
  const path = boundary === -1 ? value : value.slice(0, boundary);
  const suffix = boundary === -1 ? "" : value.slice(boundary);
  if (!path.startsWith("/")) return href;
  const bare = stripLeadingLocale(path, locale);
  return `${addLocalePrefix(bare, locale.current, locale)}${suffix}`;
}

export function buildLocaleSwitchHref(
  target: string,
  pathname: string,
  locale: CmssyLocaleContext,
): string {
  const path = pathname && pathname.startsWith("/") ? pathname : "/";
  const bare = stripLeadingLocale(path, locale);
  return addLocalePrefix(bare, target, locale);
}

const ANCHOR_HREF = /(<a\b(?:"[^"]*"|'[^']*'|[^>])*?\shref=)(["'])(.*?)\2/gi;

export function localizeHtmlLinks(
  html: string,
  locale: CmssyLocaleContext,
): string {
  return html.replace(
    ANCHOR_HREF,
    (_match, prefix: string, quote: string, url: string) =>
      `${prefix}${quote}${localizeHref(url, locale)}${quote}`,
  );
}
