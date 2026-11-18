import type { CmssyLayoutGroup } from "@cmssy/types";
import { resolveApiUrl, type CmssyClientConfig } from "../content/content-client";

export type CmssyLayoutStore = Map<string, Promise<CmssyLayoutGroup[]>>;

export function createCmssyLayoutStore(): CmssyLayoutStore {
  return new Map();
}

export type CmssyLayoutStoreSource =
  | { pageSlug: string; previewSecret: string | undefined }
  | { layoutKey: string };

export function layoutStoreKey(
  config: CmssyClientConfig,
  source: CmssyLayoutStoreSource,
): string {
  const scope = [
    resolveApiUrl(config.apiUrl),
    config.org ?? "",
    config.workspaceSlug,
  ];
  const tail =
    "layoutKey" in source
      ? ["key", source.layoutKey]
      : [
          "page",
          source.pageSlug,
          source.previewSecret ? "draft" : "published",
        ];
  return [...scope, ...tail].join("\u0000");
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
