import { createInterface } from "node:readline/promises";

import { runInit } from "./init";
import { runLink } from "./link";

const USAGE = [
  "usage: cmssy <command>",
  "  cmssy init [--dir <path>] [--force]",
  "  cmssy link [--token <cs_...>] [--workspace <slug>] [--preview-url <url>]",
].join("\n");

function flagValue(args: string[], name: string): string | undefined {
  const index = args.findIndex((arg) => arg === name);
  if (index !== -1) return args[index + 1];
  return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

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
  if (command === "link") {
    process.exitCode = await runLinkCommand(args);
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
