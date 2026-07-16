import { createInterface } from "node:readline/promises";

import { runLink } from "./link";

const USAGE =
  "usage: cmssy link [--token <cs_...>] [--workspace <slug>] [--preview-url <url>]";

function flagValue(args: string[], name: string): string | undefined {
  const index = args.findIndex((arg) => arg === name);
  if (index !== -1) return args[index + 1];
  return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "link") {
    console.error(USAGE);
    process.exitCode = command === undefined || command === "--help" ? 0 : 1;
    return;
  }
  const rl = process.stdin.isTTY
    ? createInterface({ input: process.stdin, output: process.stdout })
    : null;
  try {
    process.exitCode = await runLink(
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

main().catch((error: unknown) => {
  console.error(
    `cmssy: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
