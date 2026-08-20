import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import parser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import { noServerConfigInClient } from "../no-server-config-in-client";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");
const clientFile = resolve(FIXTURES, "editor.ts");

const HANDWRITTEN = resolve(FIXTURES, "handwritten");
const handwrittenClient = resolve(HANDWRITTEN, "editor.ts");

const ALIASED = resolve(FIXTURES, "aliased");
const aliasedClient = resolve(ALIASED, "editor.ts");
const registry = resolve(ALIASED, "registry/blocks.ts");
const lazyRegistry = resolve(ALIASED, "registry/lazy-blocks.ts");

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
  it("follows a path alias, because that is how a real app imports (CMS-1215)", () => {
    ruleTester.run("no-server-config-in-client", noServerConfigInClient, {
      valid: [
        {
          code: '"use client";\nimport type { Locale } from "@/lib/locale";\nexport type X = Locale;',
          filename: aliasedClient,
        },
      ],
      invalid: [
        {
          code: '"use client";\nimport { localePath } from "@/lib/locale";\nexport const x = localePath;',
          filename: aliasedClient,
          errors: [{ messageId: "reachesConfig" }],
        },
      ],
    });
  });

  it("treats a declared client entry as client code, directive or not (CMS-1215)", () => {
    ruleTester.run("no-server-config-in-client", noServerConfigInClient, {
      valid: [
        {
          code: 'import { heroBlock } from "@/blocks/hero";\nexport const blocks = [heroBlock];',
          filename: registry,
        },
        {
          code: 'import { heroBlock } from "@/blocks/hero";\nexport const blocks = [heroBlock];',
          filename: registry,
          options: [{ clientEntries: ["some/other/file.ts"] }],
        },
      ],
      invalid: [
        {
          code: 'import { heroBlock } from "@/blocks/hero";\nexport const blocks = [heroBlock];',
          filename: registry,
          options: [{ clientEntries: ["registry/blocks.ts"] }],
          errors: [{ messageId: "reachesConfigFromEntry" }],
        },
      ],
    });
  });

  it("stops at a server action, which never reaches the browser (CMS-1215)", () => {
    ruleTester.run("no-server-config-in-client", noServerConfigInClient, {
      valid: [
        {
          code: '"use client";\nimport { submit } from "@/actions/submit";\nexport const x = submit;',
          filename: aliasedClient,
        },
      ],
      invalid: [],
    });
  });

  it("does not follow a dynamic import, which is a chunk boundary (CMS-1215)", () => {
    ruleTester.run("no-server-config-in-client", noServerConfigInClient, {
      valid: [
        {
          code: 'import { lazyBlock } from "@/blocks/lazy";\nexport const blocks = [lazyBlock];',
          filename: lazyRegistry,
          options: [{ clientEntries: ["registry/lazy-blocks.ts"] }],
        },
      ],
      invalid: [],
    });
  });

  it("reports a config the app wrote by hand, which calls nothing (CMS-1496)", () => {
    ruleTester.run("no-server-config-in-client", noServerConfigInClient, {
      valid: [
        {
          code: '"use client";\nimport { editorOrigin } from "./public-env";\nexport const x = editorOrigin;',
          filename: handwrittenClient,
        },
        {
          code: 'import { cmssy } from "./cmssy.config";\nexport const x = cmssy;',
          filename: resolve(HANDWRITTEN, "page.ts"),
        },
      ],
      invalid: [
        {
          code: '"use client";\nimport { cmssy } from "./cmssy.config";\nexport const x = cmssy;',
          filename: handwrittenClient,
          errors: [{ messageId: "reachesConfig" }],
        },
        {
          code: '"use client";\nimport { deliveryPath } from "./lib/site";\nexport const x = deliveryPath;',
          filename: handwrittenClient,
          errors: [{ messageId: "reachesConfig" }],
        },
      ],
    });
  });

  it("reports a CMSSY_ variable read in the browser, and only that (CMS-1496)", () => {
    ruleTester.run("no-server-config-in-client", noServerConfigInClient, {
      valid: [
        {
          code: '"use client";\nexport const x = process.env.NEXT_PUBLIC_CMSSY_EDITOR_ORIGIN;',
          filename: clientFile,
        },
        {
          code: '"use client";\nexport const x = process.env.NODE_ENV;',
          filename: clientFile,
        },
        {
          code: "export const x = process.env.CMSSY_DRAFT_SECRET;",
          filename: resolve(FIXTURES, "page.ts"),
        },
      ],
      invalid: [
        {
          code: '"use client";\nexport const x = process.env.CMSSY_DRAFT_SECRET;',
          filename: clientFile,
          errors: [
            { messageId: "readsServerEnv", data: { name: "CMSSY_DRAFT_SECRET" } },
          ],
        },
        {
          code: '"use client";\nexport const x = process.env["CMSSY_API_URL"];',
          filename: clientFile,
          errors: [
            { messageId: "readsServerEnv", data: { name: "CMSSY_API_URL" } },
          ],
        },
        {
          code: 'export const x = process.env.CMSSY_ORG_SLUG;',
          filename: registry,
          options: [{ clientEntries: ["registry/blocks.ts"] }],
          errors: [
            { messageId: "readsServerEnv", data: { name: "CMSSY_ORG_SLUG" } },
          ],
        },
      ],
    });
  });

  it("follows an import written without spaces (CMS-1215)", () => {
    ruleTester.run("no-server-config-in-client", noServerConfigInClient, {
      valid: [],
      invalid: [
        {
          code: '"use client";\nimport{terseBlock}from"@/blocks/terse";\nexport const x = terseBlock;',
          filename: aliasedClient,
          errors: [{ messageId: "reachesConfig" }],
        },
      ],
    });
  });

});
