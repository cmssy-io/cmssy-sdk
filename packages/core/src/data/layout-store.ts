import type { CmssyLayoutGroup } from "@cmssy/types";
import { resolveApiUrl, type CmssyClientConfig } from "../content/content-client";

export type CmssyLayoutStore = Map<string, Promise<CmssyLayoutGroup[]>>;

export function createCmssyLayoutStore(): CmssyLayoutStore {
  return new Map();
}

export function layoutStoreKey(
  config: CmssyClientConfig,
  pageSlug: string,
  previewSecret: string | undefined,
): string {
  return [
    resolveApiUrl(config.apiUrl),
    config.org ?? "",
    config.workspaceSlug,
    pageSlug,
    previewSecret ? "draft" : "published",
  ].join("\u0000");
}

export function readThroughLayoutStore(
  store: CmssyLayoutStore | undefined,
  key: string,
  load: () => Promise<CmssyLayoutGroup[]>,
): Promise<CmssyLayoutGroup[]> {
  if (!store) return load();
  const pending = store.get(key);
  if (pending) return pending;
  const started = load();
  store.set(key, started);
  return started;
}
