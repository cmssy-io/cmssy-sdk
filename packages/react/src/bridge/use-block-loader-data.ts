import { useEffect, useRef, useState } from "react";
import { CMSSY_EDIT_TOKEN_HEADER } from "@cmssy/core";
import type {
  CmssyBlockDataRequestBlock,
  CmssyBlockDataRequestPage,
} from "../components/block-data-request";

export const CMSSY_BLOCK_DATA_PATH = "/api/cmssy/block-data";

const DEBOUNCE_MS = 300;

export interface UseBlockLoaderDataOptions {
  enabled: boolean;
  url?: string;
  token?: string;
  blocks: CmssyBlockDataRequestBlock[];
  locale: string;
  defaultLocale: string;
  enabledLocales?: string[];
  page?: CmssyBlockDataRequestPage;
}

export function useBlockLoaderData({
  enabled,
  url = CMSSY_BLOCK_DATA_PATH,
  token,
  blocks,
  locale,
  defaultLocale,
  enabledLocales,
  page,
}: UseBlockLoaderDataOptions): Record<string, unknown> {
  const [data, setData] = useState<Record<string, unknown>>({});
  const warned = useRef(false);
  const request = enabled
    ? JSON.stringify({
        blocks,
        locale,
        defaultLocale,
        enabledLocales,
        page,
      })
    : "";

  useEffect(() => {
    if (!request) return;
    if (blocks.length === 0) {
      setData((current) => (Object.keys(current).length === 0 ? current : {}));
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(token ? { [CMSSY_EDIT_TOKEN_HEADER]: token } : {}),
            },
            body: request,
            signal: controller.signal,
          });
          if (!response.ok) {
            if (!warned.current && typeof console !== "undefined") {
              warned.current = true;
              console.warn(
                `[cmssy] ${url} answered ${response.status}. Blocks with a loader keep the data the page was rendered with until it is saved. Mount createCmssyBlockDataRoute to resolve them as you edit.`,
              );
            }
            return;
          }
          const body = (await response.json()) as {
            data?: Record<string, unknown>;
          };
          setData(body.data ?? {});
        } catch (err) {
          if ((err as Error)?.name === "AbortError") return;
          if (!warned.current && typeof console !== "undefined") {
            warned.current = true;
            console.warn(`[cmssy] could not reach ${url}`, err);
          }
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [request, url, token, blocks.length]);

  return data;
}
