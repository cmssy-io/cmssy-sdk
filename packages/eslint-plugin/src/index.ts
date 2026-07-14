import { noServerConfigInClient } from "./no-server-config-in-client";

const rules = {
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
    rules: { "cmssy/no-server-config-in-client": "error" },
  },
];

export { noServerConfigInClient, rules };
export default plugin;
