import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/page.tsx"),
  route("*", "routes/page.tsx", { id: "cmssy-catch-all" }),
] satisfies RouteConfig;
