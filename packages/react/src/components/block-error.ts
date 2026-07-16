export type CmssyBlockErrorSource = "loader" | "render" | "unregistered";

export interface CmssyBlockError {
  message: string;
  source: CmssyBlockErrorSource;
}

const BLOCK_ERROR_KEY = "__cmssyBlockError";

const SOURCES: readonly CmssyBlockErrorSource[] = [
  "loader",
  "render",
  "unregistered",
];

export function blockErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function unregisteredBlockError(type: string): CmssyBlockError {
  return {
    source: "unregistered",
    message: `Block type "${type}" is not registered in this site's blocks array.`,
  };
}

export function markBlockError(
  error: CmssyBlockError,
): Record<string, CmssyBlockError> {
  return { [BLOCK_ERROR_KEY]: error };
}

export function readBlockError(value: unknown): CmssyBlockError | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const marked = (value as Record<string, unknown>)[BLOCK_ERROR_KEY];
  if (typeof marked !== "object" || marked === null) return undefined;
  const { message, source } = marked as Record<string, unknown>;
  if (typeof message !== "string") return undefined;
  if (!SOURCES.includes(source as CmssyBlockErrorSource)) return undefined;
  return { message, source: source as CmssyBlockErrorSource };
}
