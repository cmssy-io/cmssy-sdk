import { createCmssyRobots } from "@cmssy/astro";
import { cmssy } from "../cmssy.config";

export const prerender = false;
export const GET = createCmssyRobots(cmssy);
