import { cmssyMiddleware } from "@cmssy/astro";
import { cmssy } from "./cmssy.config";

// The whole adapter. It resolves the language, routes a verified editor request
// to /cmssy-edit, and applies the CSP that lets the admin frame this site.
export const onRequest = cmssyMiddleware(cmssy);
