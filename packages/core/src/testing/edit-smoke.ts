import { checkFrameAncestors } from "../preflight";

export interface EditSmokeOptions {
  baseUrl: string;
  secret: string;
  path?: string;
  localizedPath?: string;
  localizedLocale?: string;
  expectLayoutBlocks?: boolean;
  editRoute?: boolean;
}

export interface EditSmokeResult {
  ok: boolean;
  failures: string[];
  skipped: string[];
}

const EDITOR_MARKER = /data-cmssy-editor/;
const SERVER_LAYOUT_BLOCKS = /<header|<footer/;
const EDITABLE_LAYOUT_SLOT = /data-cmssy-layout-slot/;

const EDITOR_CONTENT_COUNT = /data-cmssy-editor-content="(\d+)"/g;

function resolvedContentCounts(body: string): number[] {
  return [...body.matchAll(EDITOR_CONTENT_COUNT)].map((m) => Number(m[1]));
}

async function html(
  url: string,
): Promise<{ status: number; body: string; headers: Headers }> {
  const response = await fetch(url, { redirect: "manual" });
  return {
    status: response.status,
    body: await response.text(),
    headers: response.headers,
  };
}

const EDIT_PATH_PREFIX = "/cmssy-edit";

function withoutEditPrefix(path: string): string {
  if (path === EDIT_PATH_PREFIX) return "/";
  return path.startsWith(`${EDIT_PATH_PREFIX}/`)
    ? path.slice(EDIT_PATH_PREFIX.length)
    : path;
}

function localeOf(path: string): string | undefined {
  return withoutEditPrefix(path).split("/").filter(Boolean)[0];
}

function langOf(body: string): string | undefined {
  return /<html[^>]*\slang=["']([^"']+)["']/i.exec(body)?.[1];
}

export async function checkCmssyEditMode(
  options: EditSmokeOptions,
): Promise<EditSmokeResult> {
  const { baseUrl, secret, path = "/" } = options;
  const failures: string[] = [];
  const skipped: string[] = [];
  const url = (suffix: string) => `${baseUrl.replace(/\/+$/, "")}${suffix}`;

  const publicPage = await html(url(path));
  if (publicPage.status !== 200) {
    failures.push(`public ${path}: expected 200, got ${publicPage.status}`);
  }
  if (EDITOR_MARKER.test(publicPage.body)) {
    failures.push(`public ${path}: the editor is mounted on a public page`);
  }
  const hasServerLayoutBlocks = SERVER_LAYOUT_BLOCKS.test(publicPage.body);
  if (!hasServerLayoutBlocks) {
    skipped.push(
      `layout bridge: the public ${path} server-rendered no <header> or <footer>, so nothing proved they move onto the edit bridge in edit mode`,
    );
  }

  const expectLayoutBlocks = options.expectLayoutBlocks === true;
  if (!expectLayoutBlocks) {
    skipped.push(
      "layout slot: expectLayoutBlocks is not set, so neither the mounted slot nor the content it resolved for the editor was asserted",
    );
  }

  const unverified = await html(url(`${path}?cmssyEdit=1`));
  if (EDITOR_MARKER.test(unverified.body)) {
    failures.push(
      `${path}?cmssyEdit=1: edit mode without a secret - an unverified request must not open the editor (CMS-948)`,
    );
  }

  const verified = await html(
    url(`${path}?cmssyEdit=1&cmssySecret=${encodeURIComponent(secret)}`),
  );
  if (verified.status !== 200) {
    failures.push(`edit ${path}: expected 200, got ${verified.status}`);
  }
  if (!EDITOR_MARKER.test(verified.body)) {
    failures.push(
      `edit ${path}: no editor in the response - is the /cmssy-edit route mounted?`,
    );
  }
  if (hasServerLayoutBlocks && SERVER_LAYOUT_BLOCKS.test(verified.body)) {
    failures.push(
      `edit ${path}: the header and footer are still server-rendered - the editor will let you select them but show no fields (is CMSSY_EDIT_HEADER set on the rewrite?)`,
    );
  }
  if (expectLayoutBlocks && !EDITABLE_LAYOUT_SLOT.test(verified.body)) {
    failures.push(
      `edit ${path}: expectLayoutBlocks is set and no editable layout slot is mounted - the header and footer cannot be edited (10.0 removed CmssyLayoutSlot; see docs/wiring.md §5)`,
    );
  }

  if (expectLayoutBlocks && EDITABLE_LAYOUT_SLOT.test(verified.body)) {
    const counts = resolvedContentCounts(verified.body);
    if (counts.length === 0) {
      failures.push(
        `edit ${path}: the layout slot reports no editor-content marker - @cmssy/react is older than 11.2.0, or the slot is not CmssyLazyLayout`,
      );
    } else if (counts.every((count) => count === 0)) {
      failures.push(
        `edit ${path}: every layout slot resolved 0 blocks for the editor. The slot is mounted but was not rendered in edit mode - the canvas gets nothing and the fetch ran without the preview secret, so you are editing the published page. Check that the verified request reaches the edit route with its edit signal intact.`,
      );
    }
  }

  const query = `cmssyEdit=1&cmssySecret=${encodeURIComponent(secret)}`;

  const { localizedPath } = options;
  if (!localizedPath) {
    skipped.push(
      "language: no localizedPath, so nothing checked that a prefixed URL previews in its own language",
    );
  }

  if (localizedPath) {
    const locale = options.localizedLocale ?? localeOf(localizedPath);

    const localized = await html(url(`${localizedPath}?${query}`));
    if (localized.status !== 200) {
      failures.push(
        `edit ${localizedPath}: expected 200, got ${localized.status}`,
      );
    } else {
      if (!EDITOR_MARKER.test(localized.body)) {
        failures.push(`edit ${localizedPath}: no editor in the response`);
      }
      const served = langOf(localized.body);
      if (locale && served !== locale) {
        failures.push(
          `edit ${localizedPath}: the page reports lang="${served ?? "?"}" but the URL asks for "${locale}" - the preview renders in the wrong language`,
        );
      }
      if (options.editRoute !== false) {
        await checkDirectEditRoute(url, localizedPath, query, locale, failures);
      }
    }
  }

  if (options.editRoute !== false) {
    await checkDirectEditRoute(url, path, query, undefined, failures);
  } else {
    skipped.push(
      "edit route: editRoute is false, so the direct /cmssy-edit route and its frame-ancestors were not checked",
    );
  }

  return { ok: failures.length === 0, failures, skipped };
}

async function checkDirectEditRoute(
  url: (suffix: string) => string,
  routedPath: string,
  query: string,
  locale: string | undefined,
  failures: string[],
): Promise<void> {
  const withoutPrefix = withoutEditPrefix(routedPath);
  const directPath = `${EDIT_PATH_PREFIX}${withoutPrefix === "/" ? "" : withoutPrefix}`;
  if (directPath === routedPath) return;

  const direct = await html(url(`${directPath}?${query}`));
  if (direct.status !== 200 || !EDITOR_MARKER.test(direct.body)) return;

  const directLang = langOf(direct.body);
  if (locale && directLang !== locale) {
    failures.push(
      `edit ${directPath}: reached directly the page reports lang="${directLang ?? "?"}", through the rewrite it reports "${locale}" - the same page renders in two languages depending on how the editor arrives`,
    );
  }

  const framing = checkFrameAncestors(
    direct.headers.get("content-security-policy"),
  );
  if (framing.status === "fail") {
    failures.push(
      `edit ${directPath}: ${framing.message} - the editor shows a blank panel for a route that renders fine on its own. ${framing.fix ?? ""}`.trim(),
    );
  }
}
