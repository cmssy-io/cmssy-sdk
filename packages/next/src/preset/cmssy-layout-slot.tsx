import type { ComponentType, ReactNode } from "react";
import {
  resolveCmssyLayout,
  type BlockDefinition,
  type CmssyLayoutEditableProps,
  type CmssyLayoutResolution,
  type ResolveCmssyLayoutOptions,
} from "@cmssy/react";
import {
  type CmssyConfig,
  type CmssyRegionOf,
  type RetryOption,
} from "@cmssy/core";
import { nextRetryMode } from "../retry-mode";

export type CmssyLayoutSlotRenderProps<
  C extends CmssyConfig = CmssyConfig,
  P extends CmssyRegionOf<C> = CmssyRegionOf<C>,
> = Pick<
  CmssyLayoutResolution<C, P>,
  "groups" | "settings" | "page" | "element"
>;

interface CmssyLayoutSlotBaseProps<
  C extends CmssyConfig,
  P extends CmssyRegionOf<C>,
> {
  config: C;
  blocks: BlockDefinition[];
  position: P;
  editMode: boolean;
  preview?: boolean;
  page?: string;
  editable: ComponentType<CmssyLayoutEditableProps>;
  appContext?: Record<string, unknown>;
  retry?: RetryOption;
  children?: (layout: CmssyLayoutSlotRenderProps<C, P>) => ReactNode;
}

export type CmssyLayoutSlotLocaleSource =
  { path: string[]; locale?: never } | { locale: string; path?: never };

export type CmssyLayoutSlotProps<
  C extends CmssyConfig = CmssyConfig,
  P extends CmssyRegionOf<C> = CmssyRegionOf<C>,
> = CmssyLayoutSlotBaseProps<C, P> & CmssyLayoutSlotLocaleSource;

export async function CmssyLayoutSlot<
  C extends CmssyConfig,
  P extends CmssyRegionOf<C>,
>({
  config,
  blocks,
  position,
  path,
  locale: explicitLocale,
  editMode,
  preview,
  page,
  editable,
  appContext,
  retry,
  children,
}: CmssyLayoutSlotProps<C, P>) {
  const layout = await resolveCmssyLayout(config, {
    position,
    blocks,
    editMode,
    preview,
    editable,
    ...(page !== undefined ? { page } : {}),
    appContext,
    retry: retry ?? nextRetryMode(),
    ...(explicitLocale !== undefined
      ? { locale: explicitLocale }
      : { path: path ?? [] }),
  } as ResolveCmssyLayoutOptions<C, P>);

  if (!children) return layout.element;
  const { groups, settings, page: routed, element } = layout;
  return <>{children({ groups, settings, page: routed, element })}</>;
}
