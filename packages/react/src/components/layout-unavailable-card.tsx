import type { CSSProperties } from "react";
import type { CmssyLayoutUnavailable } from "./resolve-layout-slot";

const cardStyle: CSSProperties = {
  boxSizing: "border-box",
  margin: "8px 0",
  padding: "12px 16px",
  border: "1px dashed #f59e0b",
  borderRadius: "8px",
  background: "rgba(245, 158, 11, 0.08)",
  color: "#b45309",
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

const messageStyle: CSSProperties = {
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

export interface LayoutUnavailableCardProps {
  region: string;
  unavailable: CmssyLayoutUnavailable;
}

export function retryHint(retryAfterMs: number | undefined): string {
  if (retryAfterMs === undefined) return "";
  return ` Try again in ${Math.max(1, Math.ceil(retryAfterMs / 1000))}s.`;
}

export function LayoutUnavailableCard({
  region,
  unavailable,
}: LayoutUnavailableCardProps) {
  return (
    <div
      role="alert"
      data-cmssy-layout-unavailable={region}
      data-cmssy-layout-status={unavailable.status}
      style={cardStyle}
    >
      <div style={headingStyle}>
        Layout region &quot;{region}&quot; could not be loaded ({unavailable.status}).
        {retryHint(unavailable.retryAfterMs)}
      </div>
      <div style={messageStyle}>{unavailable.message}</div>
    </div>
  );
}
