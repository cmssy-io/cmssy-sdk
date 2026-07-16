import type { PreflightResult } from "@cmssy/core/preflight";

const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const YELLOW = "\u001b[33m";
const CYAN = "\u001b[36m";
const RESET = "\u001b[0m";

export function useColor(
  env: Record<string, string | undefined> = process.env,
  isTty: boolean = Boolean(process.stdout.isTTY),
): boolean {
  return isTty && env.NO_COLOR === undefined;
}

function paint(text: string, color: string, colored: boolean): string {
  return colored ? `${color}${text}${RESET}` : text;
}

export function formatResult(
  result: PreflightResult,
  colored = useColor(),
): string {
  if (result.status === "ok") {
    return `${paint("✓", GREEN, colored)} ${result.message}`;
  }
  if (result.status === "unknown") {
    return `${paint("?", YELLOW, colored)} ${result.message}`;
  }
  const fix = result.fix ? `\n  fix: ${result.fix}` : "";
  return `${paint("✗", RED, colored)} ${result.message}${fix}`;
}

export function formatEditorLink(url: string, colored = useColor()): string {
  return `\nEdit this site visually:\n  ${paint(url, CYAN, colored)}\n`;
}
