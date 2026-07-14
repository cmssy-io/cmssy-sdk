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
   * THAT language rather than the default one.
   */
  localizedPath?: string;
  /** A word only the localized page says - "Handlekurv", say. */
  localizedMarker?: string;
}

export interface EditSmokeResult {
  ok: boolean;
  failures: string[];
}

const EDITOR_MARKER = /CmssyEditor|cmssy-edit/;
/** Layout blocks rendered server-side. In edit mode they move to the edit
 *  bridge and mount on the client, so their absence from the SSR HTML is what
 *  proves the chrome is editable rather than plain markup. */
const SERVER_CHROME = /<header|<footer/;

async function html(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url, { redirect: "manual" });
  return { status: response.status, body: await response.text() };
}

/**
 * Proves a consumer app's EDIT path still works - the path a build cannot check,
 * because the site compiles and serves fine while being uneditable.
 *
 * It asserts three independent things:
 *   1. the public page renders WITHOUT the editor, chrome server-rendered;
 *   2. a bare `?cmssyEdit=1` does NOT enter edit mode (an unverified pair must
 *      not open the door - CMS-948);
 *   3. a verified `cmssyEdit=1` + `cmssySecret` renders the editor AND moves the
 *      chrome onto the edit bridge.
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
  // failure. What matters is the CHANGE: chrome that is server-rendered publicly
  // must move to the edit bridge in edit mode.
  const hasServerChrome = SERVER_CHROME.test(publicPage.body);

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
  if (hasServerChrome && SERVER_CHROME.test(verified.body)) {
    failures.push(
      `edit ${path}: the chrome is still server-rendered - the header and footer will be selectable but have no fields (is CMSSY_EDIT_HEADER set on the rewrite?)`,
    );
  }

  const { localizedPath, localizedMarker } = options;
  if (localizedPath && localizedMarker) {
    const localized = await html(
      url(
        `${localizedPath}?cmssyEdit=1&cmssySecret=${encodeURIComponent(secret)}`,
      ),
    );
    if (!EDITOR_MARKER.test(localized.body)) {
      failures.push(`edit ${localizedPath}: no editor in the response`);
    }
    if (!localized.body.includes(localizedMarker)) {
      failures.push(
        `edit ${localizedPath}: "${localizedMarker}" is missing - the preview renders in the default language, not the one the URL asks for`,
      );
    }
  }

  return { ok: failures.length === 0, failures };
}
