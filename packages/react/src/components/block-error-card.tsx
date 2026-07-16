import type { CSSProperties } from "react";
import type { CmssyBlockError, CmssyBlockErrorSource } from "./block-error";

const SOURCE_LABELS: Record<CmssyBlockErrorSource, string> = {
  loader: "loader failed",
  render: "render failed",
  unregistered: "type not registered",
};

const cardStyle: CSSProperties = {
  boxSizing: "border-box",
  margin: "8px 0",
  padding: "12px 16px",
  border: "1px dashed #ef4444",
  borderRadius: "8px",
  background: "rgba(239, 68, 68, 0.08)",
  color: "#ef4444",
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  fontSize: "13px",
  lineHeight: 1.5,
  textAlign: "left",
};

const headingStyle: CSSProperties = {
  fontWeight: 700,
  marginBottom: "4px",
};

const metaStyle: CSSProperties = {
  opacity: 0.8,
  marginBottom: "4px",
};

const messageStyle: CSSProperties = {
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

export interface BlockErrorCardProps {
  blockType: string;
  blockId: string;
  error: CmssyBlockError;
}

export function BlockErrorCard({
  blockType,
  blockId,
  error,
}: BlockErrorCardProps) {
  return (
    <div role="alert" data-cmssy-block-error={error.source} style={cardStyle}>
      <div style={headingStyle}>
        Block &quot;{blockType}&quot; - {SOURCE_LABELS[error.source]}
      </div>
      <div style={metaStyle}>id: {blockId}</div>
      <div style={messageStyle}>{error.message}</div>
    </div>
  );
}
