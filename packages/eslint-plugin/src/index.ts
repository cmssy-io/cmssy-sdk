import tsParser from "@typescript-eslint/parser";

import { editRouteProviderParity } from "./edit-route-provider-parity";
import { noServerConfigInClient } from "./no-server-config-in-client";

const rules = {
  "edit-route-provider-parity": editRouteProviderParity,
  "no-server-config-in-client": noServerConfigInClient,
};

const plugin = {
  meta: { name: "@cmssy/eslint-plugin" },
  rules,
  configs: {} as Record<string, unknown>,
};

plugin.configs.recommended = [
  {
    plugins: { cmssy: plugin },
    rules: {
      "cmssy/edit-route-provider-parity": "error",
      "cmssy/no-server-config-in-client": "error",
    },
  },
];

plugin.configs.standalone = [
  {
    ignores: [
      "**/.next/**",
      "**/.astro/**",
      "**/.react-router/**",
      "**/.vercel/**",
      "**/build/**",
      "**/coverage/**",
      "**/dist/**",
      "**/out/**",
    ],
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tsParser,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  ...(plugin.configs.recommended as unknown[]),
];

export { editRouteProviderParity, noServerConfigInClient, rules };
export default plugin;
