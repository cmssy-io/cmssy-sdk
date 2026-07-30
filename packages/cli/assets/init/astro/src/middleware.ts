import { cmssyMiddleware } from "@cmssy/astro";
import { cmssy } from "./cmssy.config";

export const onRequest = cmssyMiddleware(cmssy);
