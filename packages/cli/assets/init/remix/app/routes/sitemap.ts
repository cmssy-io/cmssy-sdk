import { createCmssySitemap } from "@cmssy/remix";
import { cmssy } from "../../cmssy.config";

export const loader = createCmssySitemap(cmssy);
