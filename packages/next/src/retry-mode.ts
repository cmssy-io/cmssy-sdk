import type { CmssyRetryMode } from "@cmssy/core";

export const NEXT_BUILD_PHASE = "phase-production-build";

export function nextRetryMode(): CmssyRetryMode {
  const phase =
    typeof process !== "undefined" ? process.env?.NEXT_PHASE : undefined;
  return phase === NEXT_BUILD_PHASE ? "build" : "interactive";
}
