"use client";

import { Component, type ReactNode } from "react";
import { blockErrorMessage } from "./block-error";
import { BlockErrorCard } from "./block-error-card";

export interface BlockErrorBoundaryProps {
  blockType: string;
  blockId: string;
  editMode?: boolean;
  children?: ReactNode;
}

interface BlockErrorBoundaryState {
  failed: boolean;
  error: unknown;
}

export class BlockErrorBoundary extends Component<
  BlockErrorBoundaryProps,
  BlockErrorBoundaryState
> {
  override state: BlockErrorBoundaryState = { failed: false, error: undefined };

  static getDerivedStateFromError(error: unknown): BlockErrorBoundaryState {
    return { failed: true, error };
  }

  override componentDidCatch(error: unknown) {
    if (typeof console !== "undefined") {
      console.error(
        `[cmssy] block "${this.props.blockType}" (${this.props.blockId}) failed to render`,
        error,
      );
    }
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    if (!this.props.editMode) return null;
    return (
      <BlockErrorCard
        blockType={this.props.blockType}
        blockId={this.props.blockId}
        error={{
          source: "render",
          message: blockErrorMessage(this.state.error),
        }}
      />
    );
  }
}
