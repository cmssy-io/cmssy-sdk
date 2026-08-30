import { createInterface } from "node:readline/promises";

import { runAddBlock } from "./add-block";
import { flagValue, hasFlag } from "./args";
import { runInit } from "./init";
import { runLink } from "./link";
import { runSyncManifest, SYNC_MANIFEST_USAGE } from "./sync-manifest";
import { runTypes } from "./types-command";

const USAGE = [
  "usage: cmssy <command>",
  "  cmssy init [--dir <path>] [--force]",
  "  cmssy add block <name> [--dir <path>]",
  "  cmssy link [--token <cs_...>] [--workspace <slug>] [--preview-url <url>]",
  "  cmssy types [--out <path>] [--operations-out <path>] [--no-operations]",
  "              [--check] [--org <slug>] [--workspace <slug>]",
  ...SYNC_MANIFEST_USAGE,
].join("\n");

async function runLinkCommand(args: string[]): Promise<number> {
  const rl = process.stdin.isTTY
    ? createInterface({ input: process.stdin, output: process.stdout })
    : null;
  try {
    return await runLink(
      {
        token: flagValue(args, "--token"),
        workspace: flagValue(args, "--workspace"),
        previewUrl: flagValue(args, "--preview-url"),
      },
      {
        cwd: process.cwd(),
        env: process.env,
        log: (line) => console.log(line),
        fetch: globalThis.fetch,
        isTty: rl !== null,
        ask: (question) => (rl ? rl.question(question) : Promise.resolve("")),
      },
    );
  } finally {
    rl?.close();
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "init") {
    process.exitCode = runInit(
      { dir: flagValue(args, "--dir"), force: hasFlag(args, "--force") },
      { cwd: process.cwd(), log: (line) => console.log(line) },
    );
    return;
  }
  if (command === "add") {
    const [kind, name, ...rest] = args;
    if (kind !== "block" || name === undefined || name.startsWith("--")) {
      console.error(USAGE);
      process.exitCode = 1;
      return;
    }
    process.exitCode = runAddBlock(
      { name, dir: flagValue(rest, "--dir") },
      { cwd: process.cwd(), log: (line) => console.log(line) },
    );
    return;
  }
  if (command === "link") {
    process.exitCode = await runLinkCommand(args);
    return;
  }
  if (command === "types") {
    process.exitCode = await runTypes(
      {
        out: flagValue(args, "--out"),
        org: flagValue(args, "--org"),
        workspace: flagValue(args, "--workspace"),
        check: hasFlag(args, "--check"),
        operationsOut: flagValue(args, "--operations-out"),
        noOperations: hasFlag(args, "--no-operations"),
      },
      {
        cwd: process.cwd(),
        env: process.env,
        log: (line) => console.log(line),
        fetch: globalThis.fetch,
      },
    );
    return;
  }
  if (command === "sync-manifest") {
    process.exitCode = await runSyncManifest(
      {
        help: hasFlag(args, "--help"),
        blocks: flagValue(args, "--blocks"),
        config: flagValue(args, "--config"),
        token: flagValue(args, "--token"),
        org: flagValue(args, "--org"),
        workspace: flagValue(args, "--workspace"),
        dryRun: hasFlag(args, "--dry-run"),
      },
      {
        cwd: process.cwd(),
        env: process.env,
        log: (line) => console.log(line),
        fetch: globalThis.fetch,
      },
    );
    return;
  }
  console.error(USAGE);
  process.exitCode = command === undefined || command === "--help" ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(
    `cmssy: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
