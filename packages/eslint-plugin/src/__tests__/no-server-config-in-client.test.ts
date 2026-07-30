import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import parser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import { noServerConfigInClient } from "../no-server-config-in-client";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");
const clientFile = resolve(FIXTURES, "editor.ts");

const ruleTester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 2022, sourceType: "module" },
});

describe("no-server-config-in-client", () => {
  it("reports a client component that reaches the config, however indirectly", () => {
    ruleTester.run("no-server-config-in-client", noServerConfigInClient, {
      valid: [
        {
          code: '"use client";\nimport { formatSku } from "./lib/format";\nexport const x = formatSku;',
          filename: clientFile,
        },
        {
          code: '"use client";\nimport type { CmssyConfig } from "@cmssy/next/server";\nexport type X = CmssyConfig;',
          filename: clientFile,
        },
        {
          code: 'import { cmssy } from "./cmssy.config";\nexport const x = cmssy;',
          filename: resolve(FIXTURES, "page.ts"),
        },
      ],
      invalid: [
        {
          code: '"use client";\nimport { localePath } from "./lib/locale";\nexport const x = localePath;',
          filename: clientFile,
          errors: [{ messageId: "reachesConfig" }],
        },
        {
          code: '"use client";\nimport { fetchProducts } from "@cmssy/next/server";\nexport const x = fetchProducts;',
          filename: clientFile,
          errors: [{ messageId: "reachesConfig" }],
        },
      ],
    });
  });
});
