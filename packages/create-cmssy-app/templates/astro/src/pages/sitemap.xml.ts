import { createCmssySitemap } from "@cmssy/astro";
import { cmssy } from "../cmssy.config";

export const prerender = false;
export const GET = createCmssySitemap(cmssy);
