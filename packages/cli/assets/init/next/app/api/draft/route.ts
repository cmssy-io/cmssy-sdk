import { createDraftRoute } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";

export const GET = createDraftRoute(cmssy);
