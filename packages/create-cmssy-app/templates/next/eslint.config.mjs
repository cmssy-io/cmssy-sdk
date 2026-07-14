import parser from "@typescript-eslint/parser";
import cmssy from "@cmssy/eslint-plugin";

export default [
  { ignores: [".next/**", "node_modules/**"] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser, ecmaVersion: 2022, sourceType: "module" },
    plugins: { cmssy },
    rules: {
      // A client component that reaches the cmssy config drags server env into
      // the browser bundle: the page dies at runtime with "missing required
      // configuration", and no build catches it. This does.
      "cmssy/no-server-config-in-client": "error",
    },
  },
];
