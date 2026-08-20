import { cmssy } from "../cmssy.config";

export function deliveryPath(path: string): string {
  return `${cmssy.apiUrl}/public/${cmssy.org}/${cmssy.workspaceSlug}${path}`;
}
