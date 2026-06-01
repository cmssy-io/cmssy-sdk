const WARN_CAP = 256;
const warned = new Set<string>();

export interface UnknownBlockProps {
  type: string;
}

export function UnknownBlock({ type }: UnknownBlockProps) {
  if (!warned.has(type)) {
    if (warned.size >= WARN_CAP) warned.clear();
    warned.add(type);
    if (typeof console !== "undefined") {
      console.warn(`[cmssy] no component registered for block type "${type}"`);
    }
  }
  return <div data-cmssy-unknown-block={type} />;
}
