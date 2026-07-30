import type { ComponentType } from "react";
import {
  CmssyServerLayout,
  resolveCmssyLayoutSlot,
  type BlockDefinition,
  type CmssyLayoutGroup,
  type ResolveCmssyLayoutSlotOptions,
} from "@cmssy/react";
import { type CmssyConfig, type LayoutPosition } from "@cmssy/core";

interface CmssyLayoutSlotBaseProps {
  config: CmssyConfig;
  blocks: BlockDefinition[];
  position: LayoutPosition;
  editMode: boolean;
  page?: string;
  editable: ComponentType<{
    groups: CmssyLayoutGroup[];
    position: string;
    locale: string;
    defaultLocale: string;
    enabledLocales: string[];
    edit: { editorOrigin: string | string[] };
    data?: Record<string, unknown>;
    resolvedContent?: Record<string, Record<string, unknown>>;
    appContext?: Record<string, unknown>;
  }>;
  appContext?: Record<string, unknown>;
}

export type CmssyLayoutSlotLocaleSource =
  { path: string[]; locale?: never } | { locale: string; path?: never };

export type CmssyLayoutSlotProps = CmssyLayoutSlotBaseProps &
  CmssyLayoutSlotLocaleSource;

export async function CmssyLayoutSlot({
  config,
  blocks,
  position,
  path,
  locale: explicitLocale,
  editMode,
  page = "/",
  editable: Editable,
  appContext,
}: CmssyLayoutSlotProps) {
  const resolved = await resolveCmssyLayoutSlot(config, {
    position,
    blocks,
    editMode,
    page,
    appContext,
    ...(explicitLocale !== undefined
      ? { locale: explicitLocale }
      : { path: path ?? [] }),
  } as ResolveCmssyLayoutSlotOptions);

  const { groups, locale, defaultLocale, enabledLocales } = resolved;

  if (!editMode) {
    return (
      <CmssyServerLayout
        groups={groups}
        blocks={blocks}
        position={position}
        locale={locale}
        defaultLocale={defaultLocale}
        enabledLocales={enabledLocales}
        config={config}
        appContext={appContext}
      />
    );
  }

  const origin = resolved.editorOrigin;

  return (
    <Editable
      groups={groups}
      position={position}
      locale={locale}
      defaultLocale={defaultLocale}
      enabledLocales={enabledLocales}
      edit={{ editorOrigin: origin ?? "" }}
      data={resolved.data}
      resolvedContent={resolved.resolvedContent}
      appContext={appContext}
    />
  );
}
