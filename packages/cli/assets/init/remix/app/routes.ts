import { type RouteConfig, index, route } from "@react-router/dev/routes";

// The splat does not match "/", so the homepage needs its own entry - it is the
// same route module, mounted twice.
export default [
  route("sitemap.xml", "routes/sitemap.ts"),
  route("robots.txt", "routes/robots.ts"),
  index("routes/page.tsx"),
  route("*", "routes/page.tsx", { id: "cmssy-catch-all" }),
] satisfies RouteConfig;
