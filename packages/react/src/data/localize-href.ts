import type { CmssyLocaleContext } from "../components/block-context";

const PROTOCOL_OR_RELATIVE = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * True for hrefs that must not be locale-prefixed: absolute URLs (http:, https:,
 * mailto:, tel:, …), protocol-relative (//cdn…), pure fragments (#section) and
 * empty values.
 */
export function isExternalHref(href: string): boolean {
  if (!href) return true;
  if (href.startsWith("#")) return true;
  return PROTOCOL_OR_RELATIVE.test(href);
}

/**
 * Removes a leading non-default locale segment from an absolute path so a href
 * can be safely re-prefixed without doubling (`/en/about` → `/about`).
 */
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

/** Prefixes an absolute path with `target` locale; the default locale stays bare. */
function addLocalePrefix(
  path: string,
  target: string,
  locale: CmssyLocaleContext,
): string {
  if (target === locale.default) return path;
  if (path === "/") return `/${target}`;
  return `/${target}${path}`;
}

/**
 * Rewrites an internal href to carry the active locale as a path prefix.
 * External hrefs, fragments and relative paths are returned untouched. Already
 * prefixed hrefs are normalized so the prefix never doubles.
 */
export function localizeHref(href: string, locale: CmssyLocaleContext): string {
  if (isExternalHref(href)) return href;
  const boundary = href.search(/[?#]/);
  const path = boundary === -1 ? href : href.slice(0, boundary);
  const suffix = boundary === -1 ? "" : href.slice(boundary);
  if (!path.startsWith("/")) return href;
  const bare = stripLeadingLocale(path, locale);
  return `${addLocalePrefix(bare, locale.current, locale)}${suffix}`;
}

/**
 * Builds the href that switches the current `pathname` to `target` locale,
 * preserving the rest of the path. Used by a language switcher.
 */
export function buildLocaleSwitchHref(
  target: string,
  pathname: string,
  locale: CmssyLocaleContext,
): string {
  const path = pathname && pathname.startsWith("/") ? pathname : "/";
  const bare = stripLeadingLocale(path, locale);
  return addLocalePrefix(bare, target, locale);
}

const ANCHOR_HREF = /(<a\b[^>]*?\shref=)(["'])(.*?)\2/gi;

/**
 * Rewrites every `<a href>` inside an HTML string with {@link localizeHref}.
 * For rich-text content stored in CMS blocks where links are raw markup.
 */
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
