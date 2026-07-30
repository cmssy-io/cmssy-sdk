import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { applyEnv, parseEnvFile } from "./env-file";

const ENV_FILES = [".env.local", ".env"];

export function loadEnvFiles(
  cwd: string,
  env: Record<string, string | undefined>,
): void {
  for (const file of ENV_FILES) {
    const path = join(cwd, file);
    if (!existsSync(path)) continue;
    applyEnv(parseEnvFile(readFileSync(path, "utf8")), env);
  }
}
