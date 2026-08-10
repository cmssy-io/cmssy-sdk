"use server";

import { cmssy } from "@/cmssy.config";

export async function submit(): Promise<string> {
  return String(cmssy.org);
}
