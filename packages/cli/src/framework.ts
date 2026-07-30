import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CliError } from "./admin-client";

export type FrameworkName = "next" | "astro" | "remix";

export interface ScaffoldFile {
  path: string;
  purpose: string;
}

export interface FrameworkDef {
  name: FrameworkName;
  label: string;
  createCommand: string;
  detect: string[];
  dependencies: string[];
  files: ScaffoldFile[];
  warnings: string[];
}

export const FRAMEWORKS: FrameworkDef[] = [
  {
    name: "next",
    label: "Next.js",
    createCommand: "npx create-next-app@latest",
    detect: ["next"],
    dependencies: ["@cmssy/next", "@cmssy/react", "@cmssy/core"],
    files: [
      {
        path: "cmssy.config.ts",
        purpose:
          "reads server env and validates it at startup; server-only, never import a value from it in a client component",
      },
      {
        path: "proxy.ts",
        purpose:
          "resolves the language, rewrites verified editor traffic to /cmssy-edit, lets the admin frame the site; its matcher must stay a literal",
      },
      {
        path: "services/pages.ts",
        purpose:
          "your delivery queries, in your repo; generateStaticParams lives here and is what makes the catch-all cacheable at all",
      },
      {
        path: "cmssy/blocks.ts",
        purpose:
          "every block the app renders - the server renders from this list, the editor loads it lazily",
      },
      {
        path: "cmssy/editor.tsx",
        purpose:
          "loads the block registry on the client, so server-side block loaders never reach the browser bundle",
      },
      {
        path: "cmssy/editable-layout.tsx",
        purpose:
          "mounts header and footer through the edit bridge; without it the editor can select them and cannot fill them",
      },
      {
        path: "blocks/hero/block.ts",
        purpose:
          "an example block: schema beside the component that reads it (loaders: docs/building-blocks/server-loaders.md)",
      },
      {
        path: "blocks/hero/Hero.tsx",
        purpose: "its component - renaming a schema field stops this compiling",
      },
      {
        path: "app/[[...path]]/layout.tsx",
        purpose:
          "the public root layout; <html lang> comes from the route, so put your global CSS and metadata here",
      },
      {
        path: "app/[[...path]]/page.tsx",
        purpose:
          "the public catch-all: generateStaticParams plus dynamicParams decide whether this site is cached at all",
      },
      {
        path: "app/cmssy-edit/[[...path]]/layout.tsx",
        purpose:
          "the editor's root layout - a separate root, so CSS and metadata have to be repeated here",
      },
      {
        path: "app/cmssy-edit/[[...path]]/page.tsx",
        purpose:
          "the route the proxy rewrites a verified editor request onto; delete it and the editor preview goes blank",
      },
      {
        path: "app/api/draft/route.ts",
        purpose:
          "draft preview without the editor - enters draft mode for a verified secret",
      },
    ],
    warnings: [
      'pass process.env values raw into defineCmssyConfig - a `?? ""` fallback turns a missing variable into an empty one and the error surfaces somewhere unrelated',
      "the two root layouts are separate: global CSS or metadata added to one and not the other shows up as an editor preview with no styles",
      "a page without generateStaticParams renders on demand and ignores revalidate; the build's blank Revalidate column is the only warning you get",
    ],
  },
  {
    name: "astro",
    label: "Astro",
    createCommand: "npm create astro@latest",
    detect: ["astro"],
    dependencies: ["@cmssy/astro", "@cmssy/react", "@cmssy/core"],
    files: [
      {
        path: "src/cmssy.config.ts",
        purpose:
          "reads env and validates it at startup; pass the values raw so a missing one is named here",
      },
      {
        path: "src/middleware.ts",
        purpose:
          "the whole adapter: resolves the language, rewrites verified editor requests to /cmssy-edit, applies the framing CSP",
      },
      {
        path: "src/cmssy/blocks.ts",
        purpose: "every block the app renders",
      },
      {
        path: "src/cmssy/editor.tsx",
        purpose:
          "the edit bridge as a client island - the postMessage protocol lives in @cmssy/core, which is why it works outside React frameworks",
      },
      {
        path: "src/cmssy/layout-slot.tsx",
        purpose:
          "header and footer: server-rendered for visitors, through the edit bridge on the edit route; resolvedContent is what stops a relation field showing raw ids",
      },
      {
        path: "src/cmssy/hero.tsx",
        purpose: "an example block - schema beside the component that reads it",
      },
      {
        path: "src/components/Blocks.tsx",
        purpose:
          "renders React blocks on the server with no client JS - the visitor gets HTML",
      },
      {
        path: "src/pages/[...path].astro",
        purpose:
          "the public catch-all; its `blocks` prop is what lets the loader resolve the editor's layout data",
      },
      {
        path: "src/pages/cmssy-edit/[...path].astro",
        purpose:
          "where the editor iframe lands - must stay dynamic, because a prerendered page never sees the query string",
      },
    ],
    warnings: [
      'pass env values raw into defineCmssyConfig - a `?? ""` fallback hides a missing variable until it breaks somewhere unrelated',
      "the `blocks` prop on both page routes is not decoration: without it the site still renders and the editor can select a header it cannot fill",
    ],
  },
  {
    name: "remix",
    label: "React Router 7 / Remix",
    createCommand: "npx create-react-router@latest",
    detect: ["react-router", "@react-router/dev", "@remix-run/react"],
    dependencies: ["@cmssy/remix", "@cmssy/react", "@cmssy/core"],
    files: [
      {
        path: "cmssy.config.ts",
        purpose:
          "reads env and validates it at startup; pass the values raw so a missing one is named here",
      },
      {
        path: "app/root.tsx",
        purpose:
          "the root layout - <html lang> comes from useCmssyLocale(), so a prefixed URL declares the language it renders",
      },
      {
        path: "app/routes.ts",
        purpose:
          'mounts the page module twice: the splat does not match "/", so the homepage needs its own entry',
      },
      {
        path: "app/cmssy/blocks.ts",
        purpose: "every block the app renders",
      },
      {
        path: "app/cmssy/editor.tsx",
        purpose:
          "the edit bridge - the postMessage protocol lives in @cmssy/core, not in the framework",
      },
      {
        path: "app/cmssy/layout-slot.tsx",
        purpose:
          "header and footer: server-rendered for visitors, through the edit bridge for the editor; resolvedContent is what stops a relation field showing raw ids",
      },
      {
        path: "app/cmssy/hero.tsx",
        purpose: "an example block - schema beside the component that reads it",
      },
      {
        path: "app/routes/page.tsx",
        purpose:
          "one route for both modes - a React Router page always sees its query string, so there is no separate edit route; its headers are what let the admin frame the site",
      },
    ],
    warnings: [
      'pass env values raw into defineCmssyConfig - a `?? ""` fallback hides a missing variable until it breaks somewhere unrelated',
      "the route's `blocks` prop and its CSP headers are load-bearing: drop either and the site renders while the editor shows an empty box with no error",
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
