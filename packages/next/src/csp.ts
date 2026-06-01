export interface CmssyCspOptions {
  editorOrigin: string | string[];
}

interface MutableHeaders {
  headers: {
    get: (name: string) => string | null;
    set: (name: string, value: string) => void;
    delete: (name: string) => void;
  };
}

export function toCspOrigin(origin: string): string {
  if (origin === "*") return "*";
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`cmssy: invalid editorOrigin "${origin}"`);
  }
  if (parsed.origin === "null") {
    throw new Error(`cmssy: editorOrigin "${origin}" has no usable origin`);
  }
  return parsed.origin;
}

function frameAncestors(editorOrigin: string | string[]): string {
  const origins = Array.isArray(editorOrigin) ? editorOrigin : [editorOrigin];
  if (origins.length === 0) {
    throw new Error(
      "cmssy: editorOrigin must contain at least one valid origin",
    );
  }
  const normalized = origins.map((origin) => toCspOrigin(origin.trim()));
  return `frame-ancestors ${normalized.join(" ")}`;
}

export function cmssyCspHeaders(
  options: CmssyCspOptions,
): Record<string, string> {
  return {
    "Content-Security-Policy": frameAncestors(options.editorOrigin),
  };
}

function mergeFrameAncestors(
  existing: string | null,
  directive: string,
): string {
  if (!existing) return directive;
  const kept = existing
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^frame-ancestors\b/i.test(part));
  kept.push(directive);
  return kept.join("; ");
}

export function applyCmssyCsp<T extends MutableHeaders>(
  response: T,
  options: CmssyCspOptions,
): T {
  const merged = mergeFrameAncestors(
    response.headers.get("Content-Security-Policy"),
    frameAncestors(options.editorOrigin),
  );
  response.headers.set("Content-Security-Policy", merged);
  response.headers.delete("X-Frame-Options");
  return response;
}
