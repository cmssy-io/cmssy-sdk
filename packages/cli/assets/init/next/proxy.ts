import { createCmssyProxy } from "@cmssy/next/middleware";
import { cmssy } from "@/cmssy.config";

export const proxy = createCmssyProxy(cmssy);

export const config = {
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
