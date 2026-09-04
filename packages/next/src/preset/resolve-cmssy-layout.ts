import {
  resolveCmssyLayout as resolveWithReact,
  type CmssyLayoutResolution,
  type ResolveCmssyLayoutOptions as ReactResolveCmssyLayoutOptions,
} from "@cmssy/react";
import type { CmssyConfig, CmssyRegionOf } from "@cmssy/core";
import { nextRetryMode } from "../retry-mode";
import { cmssyCachedFetch, type CmssyDataCacheOptions } from "../data-cache";

export type ResolveCmssyLayoutOptions<
  C extends CmssyConfig,
  P extends CmssyRegionOf<C>,
> = ReactResolveCmssyLayoutOptions<C, P> & { cache?: CmssyDataCacheOptions };

export function resolveCmssyLayout<
  C extends CmssyConfig,
  P extends CmssyRegionOf<C>,
>(
  config: C,
  options: ResolveCmssyLayoutOptions<C, P>,
): Promise<CmssyLayoutResolution<C, P>> {
  const { cache, ...rest } = options;
  const live = rest.editMode || rest.preview === true;
  const fetchImpl =
    rest.fetch ?? (cache && !live ? cmssyCachedFetch(cache) : undefined);
  return resolveWithReact(config, {
    ...rest,
    retry: rest.retry ?? nextRetryMode(),
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  } as ReactResolveCmssyLayoutOptions<C, P>);
}
