import { headers } from "next/headers";
import { CMSSY_EDIT_HEADER } from "@cmssy/core";

export async function isCmssyEditMode(): Promise<boolean> {
  const h = await headers();
  return h.get(CMSSY_EDIT_HEADER) === "1";
}
