import { cmssy } from "../cmssy.config";

export function localePath(locale: string, path: string): string {
  return locale === cmssy.workspaceSlug ? path : `/${locale}${path}`;
}
