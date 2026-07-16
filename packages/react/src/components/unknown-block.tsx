const WARN_CAP = 256;
const warned = new Set<string>();

export interface UnknownBlockProps {
  type: string;
}

export function UnknownBlock({ type }: UnknownBlockProps) {
  if (typeof window !== "undefined" && !warned.has(type)) {
    if (warned.size >= WARN_CAP) warned.clear();
    warned.add(type);
    console.error(`[cmssy] no component registered for block type "${type}"`);
  }
  return <div data-cmssy-unknown-block={type} />;
}
