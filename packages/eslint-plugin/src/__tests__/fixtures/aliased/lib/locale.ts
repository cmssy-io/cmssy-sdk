import { cmssy } from "@/cmssy.config";

export function localePath(path: string): string {
  return `${String(cmssy.org)}${path}`;
}
