import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CliError } from "./admin-client";

export type FrameworkName = "next" | "astro" | "remix";

export interface FrameworkDef {
  name: FrameworkName;
  label: string;
  createCommand: string;
  detect: string[];
  dependencies: string[];
  files: string[];
}

export const FRAMEWORKS: FrameworkDef[] = [
  {
    name: "next",
    label: "Next.js",
    createCommand: "npx create-next-app@latest",
    detect: ["next"],
    dependencies: ["@cmssy/next", "@cmssy/react"],
    files: [
      "cmssy.config.ts",
      "proxy.ts",
      "cmssy/blocks.ts",
      "cmssy/editor.tsx",
      "cmssy/editable-layout.tsx",
      "blocks/hero/block.ts",
      "blocks/hero/Hero.tsx",
      "app/[[...path]]/page.tsx",
      "app/cmssy-edit/[[...path]]/page.tsx",
      "app/api/draft/route.ts",
      "app/robots.ts",
      "app/sitemap.ts",
    ],
  },
  {
    name: "astro",
    label: "Astro",
    createCommand: "npm create astro@latest",
    detect: ["astro"],
    dependencies: ["@cmssy/astro", "@cmssy/react", "@cmssy/core"],
    files: [
      "src/cmssy.config.ts",
      "src/middleware.ts",
      "src/cmssy/blocks.ts",
      "src/cmssy/editor.tsx",
      "src/cmssy/hero.tsx",
      "src/components/Blocks.tsx",
      "src/pages/[...path].astro",
      "src/pages/cmssy-edit/[...path].astro",
      "src/pages/robots.txt.ts",
      "src/pages/sitemap.xml.ts",
    ],
  },
  {
    name: "remix",
    label: "React Router 7 / Remix",
    createCommand: "npx create-react-router@latest",
    detect: ["react-router", "@react-router/dev", "@remix-run/react"],
    dependencies: ["@cmssy/remix", "@cmssy/react", "@cmssy/core"],
    files: [
      "cmssy.config.ts",
      "app/routes.ts",
      "app/cmssy/blocks.ts",
      "app/cmssy/editor.tsx",
      "app/cmssy/hero.tsx",
      "app/routes/page.tsx",
      "app/routes/robots.ts",
      "app/routes/sitemap.ts",
    ],
  },
];

export interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function readPackageJson(root: string): PackageManifest {
  const path = join(root, "package.json");
  if (!existsSync(path)) {
    throw new CliError(
      `no package.json in ${root}`,
      "cmssy init wires cmssy into an EXISTING app - create one first, then rerun inside it",
    );
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PackageManifest;
  } catch {
    throw new CliError(`${path} is not valid JSON`);
  }
}

export function detectFramework(pkg: PackageManifest): FrameworkDef {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const match = FRAMEWORKS.find((framework) =>
    framework.detect.some((name) => deps[name] !== undefined),
  );
  if (!match) {
    const hints = FRAMEWORKS.map(
      (framework) =>
        `${framework.label}: create the app with \`${framework.createCommand}\`, then rerun cmssy init inside it`,
    );
    throw new CliError(
      "no supported framework in package.json (looked for next, astro, react-router)",
      hints.join("\n       "),
    );
  }
  return match;
}

export function nextSrcPrefix(root: string): string {
  return existsSync(join(root, "src", "app")) ? "src/" : "";
}
