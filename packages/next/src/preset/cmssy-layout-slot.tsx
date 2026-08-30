import type { ComponentType } from "react";
import {
  CmssyServerLayout,
  resolveCmssyLayoutSlot,
  type BlockDefinition,
  type CmssyLayoutGroup,
  type ResolveCmssyLayoutSlotOptions,
} from "@cmssy/react";
import {
  type CmssyConfig,
  type CmssyRegionOf,
  type RetryOption,
} from "@cmssy/core";
import { nextRetryMode } from "../retry-mode";

interface CmssyLayoutSlotBaseProps<C extends CmssyConfig> {
  config: C;
  blocks: BlockDefinition[];
  position: CmssyRegionOf<C>;
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
  retry?: RetryOption;
}

export type CmssyLayoutSlotLocaleSource =
  { path: string[]; locale?: never } | { locale: string; path?: never };

export type CmssyLayoutSlotProps<C extends CmssyConfig = CmssyConfig> =
  CmssyLayoutSlotBaseProps<C> & CmssyLayoutSlotLocaleSource;

export async function CmssyLayoutSlot<C extends CmssyConfig>({
  config,
  blocks,
  position,
  path,
  locale: explicitLocale,
  editMode,
  page,
  editable: Editable,
  appContext,
  retry,
}: CmssyLayoutSlotProps<C>) {
  const resolved = await resolveCmssyLayoutSlot(config, {
    position,
    blocks,
    editMode,
    ...(page !== undefined ? { page } : {}),
    appContext,
    retry: retry ?? nextRetryMode(),
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
