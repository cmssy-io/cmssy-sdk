function needsQuoting(value: string): boolean {
  return /[\s#"']/.test(value) || value === "";
}

function serialize(key: string, value: string): string {
  return needsQuoting(value)
    ? `${key}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
    : `${key}=${value}`;
}

export function mergeEnvContent(
  existing: string | null,
  updates: Record<string, string>,
): string {
  const pending = new Map(Object.entries(updates));
  const lines = existing ? existing.split(/\r?\n/) : [];
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const merged = lines.map((line) => {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    const key = match?.[1];
    if (!key || !pending.has(key)) return line;
    const value = pending.get(key) as string;
    pending.delete(key);
    return serialize(key, value);
  });

  for (const [key, value] of pending) {
    merged.push(serialize(key, value));
  }
  return `${merged.join("\n")}\n`;
}
