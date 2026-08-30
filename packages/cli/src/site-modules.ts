import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { build, type Loader, type Plugin } from "esbuild";

import { CliError } from "./admin-client";

const RUNTIME_ONLY_MODULES = ["server-only", "client-only"];

const ASSET_EXTENSIONS = [
  ".module.css",
  ".module.scss",
  ".module.sass",
  ".module.less",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".mp4",
  ".webm",
  ".mp3",
  ".md",
  ".mdx",
];

const assetLoaders = Object.fromEntries(
  ASSET_EXTENSIONS.map((extension) => [extension, "empty" as Loader]),
);

const runtimeOnlyModules: Plugin = {
  name: "cmssy-runtime-only-modules",
  setup(api) {
    const filter = new RegExp(`^(${RUNTIME_ONLY_MODULES.join("|")})$`);
    api.onResolve({ filter }, (args) => ({
      path: args.path,
      namespace: "cmssy-empty",
    }));
    api.onLoad({ filter: /.*/, namespace: "cmssy-empty" }, () => ({
      contents: "export {};",
      loader: "js",
    }));
  },
};

export type SiteModuleLoader = (
  cwd: string,
  entry: string,
) => Promise<Record<string, unknown>>;

export async function loadSiteModule(
  cwd: string,
  entry: string,
): Promise<Record<string, unknown>> {
  const entryPath = resolve(cwd, entry);
  let code: string;
  try {
    const result = await build({
      absWorkingDir: cwd,
      entryPoints: [entryPath],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      write: false,
      packages: "external",
      jsx: "automatic",
      loader: assetLoaders,
      define: { "import.meta.env": "process.env" },
      plugins: [runtimeOnlyModules],
      logLevel: "silent",
    });
    code = result.outputFiles[0]?.text ?? "";
  } catch (error) {
    const messages =
      error && typeof error === "object" && "errors" in error
        ? (
            error as {
              errors: Array<{
                text: string;
                location?: { file: string; line: number } | null;
              }>;
            }
          ).errors.map((issue) =>
            issue.location
              ? `${issue.location.file}:${issue.location.line} ${issue.text}`
              : issue.text,
          )
        : [error instanceof Error ? error.message : String(error)];
    throw new CliError(`could not compile ${entry}`, messages.join("\n  "));
  }

  const dir = join(cwd, "node_modules", ".cache", "cmssy");
  const file = join(
    dir,
    `${basename(entry).replace(/\.[^.]+$/, "")}.${process.pid}.${Date.now()}.mjs`,
  );
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, code);
  } catch (error) {
    throw new CliError(
      `could not write the compiled ${entry} to ${dir}`,
      error instanceof Error ? error.message : String(error),
    );
  }
  try {
    return (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  } catch (error) {
    throw new CliError(
      `could not load ${entry}`,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    rmSync(file, { force: true });
  }
}
