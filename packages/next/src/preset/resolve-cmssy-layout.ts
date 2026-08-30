import {
  resolveCmssyLayout as resolveWithReact,
  type CmssyLayoutResolution,
  type ResolveCmssyLayoutOptions,
} from "@cmssy/react";
import type { CmssyConfig, CmssyRegionOf } from "@cmssy/core";
import { nextRetryMode } from "../retry-mode";

export function resolveCmssyLayout<
  C extends CmssyConfig,
  P extends CmssyRegionOf<C>,
>(
  config: C,
  options: ResolveCmssyLayoutOptions<C, P>,
): Promise<CmssyLayoutResolution<C, P>> {
  return resolveWithReact(config, {
    ...options,
    retry: options.retry ?? nextRetryMode(),
  });
}
