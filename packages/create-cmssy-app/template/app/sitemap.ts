import { createCmssySitemap } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";

// One entry per language version of every published page, with hreflang and
// x-default. Rendering products or categories from model records? They are not
// pages - add them through `extra`.
export default createCmssySitemap(cmssy);
