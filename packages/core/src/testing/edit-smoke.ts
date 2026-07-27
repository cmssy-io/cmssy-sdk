import { graphqlRequest } from "../data/graphql-request";

export interface EditSmokeOptions {
  /** A running build of the consumer app, e.g. http://localhost:3000. */
  baseUrl: string;
  /** The site's CMSSY_DRAFT_SECRET. Without it nothing can be verified. */
  secret: string;
  /** A published page to exercise. Defaults to "/". */
  path?: string;
  /**
   * The same page under a language prefix, e.g. "/no". Pass it on a site whose
   * URLs carry the language, and the check also proves the preview renders in
   * THAT language rather than the default one - by reading `<html lang>`, which
   * is a contract, unlike a word from the page's copy that an editor can change
   * at any time.
   */
  localizedPath?: string;
  /**
   * The language `localizedPath` must render, e.g. "no". Defaults to the first
   * path segment, which IS the language on a prefixed site.
   */
  localizedLocale?: string;
  /**
   * The workspace the app is pointed at. Given it, the check asks the delivery
   * API whether the workspace HAS header/footer blocks - and if it does, an app
   * that renders none is a failure rather than a site that simply has none.
   *
   * That distinction is the whole point. `cmssy init` once scaffolded the
   * editable-layout wrapper with nothing mounting it, so the app rendered no
   * header at all - and this check, unable to tell "none configured" from "none
   * rendered", stayed green.
   */
  workspace?: { org: string; workspaceSlug: string; apiUrl?: string };
}

export interface EditSmokeResult {
  ok: boolean;
  failures: string[];
}

// The edit bridge renders `data-cmssy-editor` (see @cmssy/react). Matching that
// is a contract; matching a chunk name or a component name - as this once did -
// is matching whatever the bundler happened to emit, which passed on two
// frameworks by luck and failed on the third for no reason.
const EDITOR_MARKER = /data-cmssy-editor/;
/**
 * Layout blocks rendered server-side. In edit mode they move to the edit bridge
 * and mount on the client, so their absence from the SSR HTML is what proves
 * the header and footer are editable blocks rather than plain markup.
 *
 * `data-cmssy-unknown-block` counts: an app whose registry does not know the
 * workspace's header type still RENDERED the layout group, which is what this
 * asks about. Matching only `<header>` would call a mounted slot missing.
 */
const SERVER_LAYOUT_BLOCKS = /<header|<footer/;
/**
 * The editable layout slot renders this server-side (see CmssyLazyLayout). Its
 * blocks mount on the client, so this marker is the only thing in the edit
 * route's HTML that says a slot is mounted at all - which is exactly what
 * "the editor lets me select the header but shows no fields" comes down to.
 */
const EDITABLE_LAYOUT_SLOT = /data-cmssy-layout-slot/;

/**
 * How many layout blocks the slot actually resolved content for.
 *
 * The marker above proves a slot is mounted and nothing else: every scaffold
 * renders one whether or not the request was verified. That is how an adapter
 * ran with edit mode permanently off - fetching without the preview secret,
 * handing the canvas nothing - while this check stayed green for months. A
 * count above zero is reachable only through a real editor render.
 */
const EDITOR_CONTENT_COUNT = /data-cmssy-editor-content="(\d+)"/g;

function resolvedContentCounts(body: string): number[] {
  return [...body.matchAll(EDITOR_CONTENT_COUNT)].map((m) => Number(m[1]));
}

async function html(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url, { redirect: "manual" });
  return { status: response.status, body: await response.text() };
}

const LAYOUT_BLOCKS_QUERY = `query CmssySmokeLayouts($workspaceSlug: String!, $pageSlug: String!) {
  public {
    page {
      layouts(workspaceSlug: $workspaceSlug, pageSlug: $pageSlug) {
        position
        blocks { id isActive }
      }
    }
  }
}`;

interface LayoutProbe {
  public?: {
    page?: {
      layouts?: Array<{ blocks?: Array<{ isActive?: boolean | null }> }> | null;
    } | null;
  } | null;
}

/**
 * Whether the workspace defines any active layout block for the page.
 * `null` means the question could not be answered - an unreachable API is not
 * the app's fault, so it must not turn into a failure about the app.
 */
async function workspaceHasLayoutBlocks(
  workspace: NonNullable<EditSmokeOptions["workspace"]>,
  pageSlug: string,
): Promise<boolean | null> {
  try {
    const data = await graphqlRequest<LayoutProbe>(
      workspace,
      LAYOUT_BLOCKS_QUERY,
      { workspaceSlug: workspace.workspaceSlug, pageSlug },
      { public: true, retry: {} },
      "edit smoke: layout blocks",
    );
    const groups = data.public?.page?.layouts ?? [];
    return groups.some((group) =>
      (group.blocks ?? []).some((block) => block.isActive !== false),
    );
  } catch {
    return null;
  }
}

/**
 * Proves a consumer app's EDIT path still works - the path a build cannot check,
 * because the site compiles and serves fine while being uneditable.
 *
 * It asserts four independent things:
 *   1. the public page renders WITHOUT the editor, header and footer server-rendered;
 *   2. a bare `?cmssyEdit=1` does NOT enter edit mode (an unverified pair must
 *      not open the door - CMS-948);
 *   3. a verified `cmssyEdit=1` + `cmssySecret` renders the editor AND moves the
 *      header and footer onto the edit bridge;
 *   4. given `workspace`, that an app whose workspace HAS layout blocks renders
 *      them at all - the one thing "no header anywhere" and "no header
 *      configured" otherwise look alike.
 *
 * Run it against a started production build:
 *
 *   const result = await checkCmssyEditMode({ baseUrl, secret });
 *   expect(result.failures).toEqual([]);
 */
export async function checkCmssyEditMode(
  options: EditSmokeOptions,
): Promise<EditSmokeResult> {
  const { baseUrl, secret, path = "/" } = options;
  const failures: string[] = [];
  const url = (suffix: string) => `${baseUrl.replace(/\/+$/, "")}${suffix}`;

  const publicPage = await html(url(path));
  if (publicPage.status !== 200) {
    failures.push(`public ${path}: expected 200, got ${publicPage.status}`);
  }
  if (EDITOR_MARKER.test(publicPage.body)) {
    failures.push(`public ${path}: the editor is mounted on a public page`);
  }
  // A site with no layout blocks is perfectly valid, so their absence is not a
  // failure on its own. What matters is the CHANGE: a header that is
  // server-rendered publicly must move to the edit bridge in edit mode.
  const hasServerLayoutBlocks = SERVER_LAYOUT_BLOCKS.test(publicPage.body);

  // Whether the workspace has any header/footer to render in the first place.
  const configured = options.workspace
    ? await workspaceHasLayoutBlocks(options.workspace, path)
    : null;

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
  // The workspace has layout blocks and the edit route mounts no slot for them:
  // the editor will show a page with no header to edit. This is the check that
  // an app scaffolded without a layout slot fails.
  if (configured === true && !EDITABLE_LAYOUT_SLOT.test(verified.body)) {
    failures.push(
      `edit ${path}: the workspace defines layout blocks and no editable layout slot is mounted - the header and footer cannot be edited (10.0 removed CmssyLayoutSlot; see docs/wiring.md §5)`,
    );
  }

  // A mounted slot that resolved nothing is a slot rendered outside edit mode:
  // the page looks editable and the canvas has no content to show. Only assert
  // it when the workspace is known to have blocks - an empty position legally
  // resolves to zero.
  if (configured === true && EDITABLE_LAYOUT_SLOT.test(verified.body)) {
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

  const { localizedPath } = options;
  if (localizedPath) {
    const locale =
      options.localizedLocale ?? localizedPath.split("/").filter(Boolean)[0];
    const localized = await html(
      url(
        `${localizedPath}?cmssyEdit=1&cmssySecret=${encodeURIComponent(secret)}`,
      ),
    );
    if (!EDITOR_MARKER.test(localized.body)) {
      failures.push(`edit ${localizedPath}: no editor in the response`);
    }
    const served = /<html[^>]*\slang=["']([^"']+)["']/i.exec(localized.body)?.[1];
    if (locale && served !== locale) {
      failures.push(
        `edit ${localizedPath}: the page reports lang="${served ?? "?"}" but the URL asks for "${locale}" - the preview renders in the wrong language`,
      );
    }
  }

  return { ok: failures.length === 0, failures };
}
