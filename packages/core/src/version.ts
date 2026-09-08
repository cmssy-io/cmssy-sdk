declare const __CMSSY_CORE_VERSION__: string | undefined;

export const CMSSY_CORE_VERSION: string =
  typeof __CMSSY_CORE_VERSION__ === "string" ? __CMSSY_CORE_VERSION__ : "dev";

export const CMSSY_USER_AGENT = `@cmssy/core/${CMSSY_CORE_VERSION}`;
