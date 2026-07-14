import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import node from "@astrojs/node";

export default defineConfig({
  output: "server",
  // Standalone Node so `pnpm build && pnpm start` runs anywhere - including the
  // smoke test, which needs a real production server. Swap in @astrojs/vercel
  // (or any adapter) when you deploy.
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
});
