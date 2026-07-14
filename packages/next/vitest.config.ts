import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `server-only` throws unless the importer resolves the react-server
    // condition, which is the point: it is what turns "config in the browser
    // bundle" into a build error. Vitest resolves like a client, so the guard
    // would fail the suite instead of the mistake it exists to catch.
    alias: {
      "server-only": new URL("./src/__tests__/server-only.ts", import.meta.url)
        .pathname,
    },
  },
});
