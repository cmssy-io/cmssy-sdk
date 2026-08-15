import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import parser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import { editRouteProviderParity } from "../edit-route-provider-parity";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

const publicLayout = resolve(FIXTURES, "parity/app/[[...path]]/layout.tsx");
const editLayout = resolve(
  FIXTURES,
  "parity/app/cmssy-edit/[[...path]]/layout.tsx",
);
const pairedLayout = resolve(FIXTURES, "parity-ok/app/[[...path]]/layout.tsx");
const lonelyLayout = resolve(FIXTURES, "lonely/app/[[...path]]/layout.tsx");
const publicPage = resolve(FIXTURES, "parity/app/[[...path]]/page.tsx");
const rootLayout = resolve(FIXTURES, "parity/app/layout.tsx");

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const WRAPS_MOTION = `export default function SiteLayout({ children }) {
  return (
    <CmssyLocaleProvider>
      <MotionProvider>{children}</MotionProvider>
    </CmssyLocaleProvider>
  );
}`;

describe("edit-route-provider-parity", () => {
  it("names a provider the public route wraps the blocks in and the edit route does not", () => {
    ruleTester.run("edit-route-provider-parity", editRouteProviderParity, {
      valid: [],
      invalid: [
        {
          code: WRAPS_MOTION,
          filename: publicLayout,
          errors: [{ messageId: "missingProvider" }],
        },
      ],
    });
  });

  it("stays quiet once the edit route renders the same provider", () => {
    ruleTester.run("edit-route-provider-parity", editRouteProviderParity, {
      valid: [{ code: WRAPS_MOTION, filename: pairedLayout }],
      invalid: [],
    });
  });

  it("judges every provider, not only the first one missing", () => {
    ruleTester.run("edit-route-provider-parity", editRouteProviderParity, {
      valid: [],
      invalid: [
        {
          code: `export default function SiteLayout({ children }) {
  return (
    <MotionProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </MotionProvider>
  );
}`,
          filename: publicLayout,
          errors: [
            { messageId: "missingProvider" },
            { messageId: "missingProvider" },
          ],
        },
      ],
    });
  });

  it("leaves a provider that does not wrap the blocks alone", () => {
    ruleTester.run("edit-route-provider-parity", editRouteProviderParity, {
      valid: [
        {
          code: `export default function SiteLayout({ children }) {
  return (
    <CmssyLocaleProvider>
      <MotionProvider><Banner /></MotionProvider>
      {children}
    </CmssyLocaleProvider>
  );
}`,
          filename: publicLayout,
        },
      ],
      invalid: [],
    });
  });

  it("says nothing about a layout that renders no provider at all", () => {
    ruleTester.run("edit-route-provider-parity", editRouteProviderParity, {
      valid: [
        {
          code: `export default function SiteLayout({ children }) {
  return <main className="wrap">{children}</main>;
}`,
          filename: publicLayout,
        },
      ],
      invalid: [],
    });
  });

  it("holds its peace where the app has no edit route", () => {
    ruleTester.run("edit-route-provider-parity", editRouteProviderParity, {
      valid: [{ code: WRAPS_MOTION, filename: lonelyLayout }],
      invalid: [],
    });
  });

  it("does not turn on the edit layout itself", () => {
    ruleTester.run("edit-route-provider-parity", editRouteProviderParity, {
      valid: [{ code: WRAPS_MOTION, filename: editLayout }],
      invalid: [],
    });
  });

  it("judges layouts only - a page's own provider is that page's business", () => {
    ruleTester.run("edit-route-provider-parity", editRouteProviderParity, {
      valid: [{ code: WRAPS_MOTION, filename: publicPage }],
      invalid: [],
    });
  });

  it("does not turn on the root layout both routes already share", () => {
    ruleTester.run("edit-route-provider-parity", editRouteProviderParity, {
      valid: [{ code: WRAPS_MOTION, filename: rootLayout }],
      invalid: [],
    });
  });

  it("counts a framer-motion wrapper that carries no Provider suffix", () => {
    ruleTester.run("edit-route-provider-parity", editRouteProviderParity, {
      valid: [],
      invalid: [
        {
          code: `export default function SiteLayout({ children }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}`,
          filename: publicLayout,
          errors: [{ messageId: "missingProvider" }],
        },
      ],
    });
  });
});
