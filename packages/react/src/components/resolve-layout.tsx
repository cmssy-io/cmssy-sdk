import type { ComponentType, ReactElement } from "react";
import type {
  CmssyBlockPage,
  CmssyConfig,
  CmssyLayoutGroup,
  CmssyRegionOf,
  CmssyRegionSettingsOf,
} from "@cmssy/core";
import { CmssyServerLayout } from "./cmssy-server-layout";
import { LayoutUnavailableCard } from "./layout-unavailable-card";
import {
  resolveCmssyLayoutSlot,
  type CmssyLayoutSlotLocaleSource,
  type CmssyLayoutUnavailable,
  type ResolveCmssyLayoutSlotOptions,
} from "./resolve-layout-slot";

export interface CmssyLayoutEditableProps {
  groups: CmssyLayoutGroup[];
  region: string;
  page?: CmssyBlockPage;
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  edit: { editorOrigin: string | string[] };
  data?: Record<string, unknown>;
  resolvedContent?: Record<string, Record<string, unknown>>;
  appContext?: Record<string, unknown>;
}

export type ResolveCmssyLayoutOptions<
  C extends CmssyConfig,
  P extends CmssyRegionOf<C>,
> = Omit<
  ResolveCmssyLayoutSlotOptions,
  "region" | keyof CmssyLayoutSlotLocaleSource
> &
  CmssyLayoutSlotLocaleSource & {
    region: P;
    editable?: ComponentType<CmssyLayoutEditableProps>;
  };

export interface CmssyLayoutResolution<
  C extends CmssyConfig = CmssyConfig,
  P extends CmssyRegionOf<C> = CmssyRegionOf<C>,
> {
  groups: CmssyLayoutGroup[];
  unavailable?: CmssyLayoutUnavailable;
  settings: CmssyRegionSettingsOf<C, P> | null;
  page: CmssyBlockPage;
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  element: ReactElement<Record<string, unknown>>;
}

export async function resolveCmssyLayout<
  C extends CmssyConfig,
  P extends CmssyRegionOf<C>,
>(
  config: C,
  options: ResolveCmssyLayoutOptions<C, P>,
): Promise<CmssyLayoutResolution<C, P>> {
  const { editable: Editable, ...slotOptions } = options;
  if (slotOptions.editMode && !Editable) {
    throw new Error(
      "cmssy: resolveCmssyLayout needs an `editable` component in edit mode - the editor bridge lives on the client",
    );
  }
  const resolved = await resolveCmssyLayoutSlot(
    config,
    slotOptions as ResolveCmssyLayoutSlotOptions,
  );
  const { groups, settings, page, locale, defaultLocale, enabledLocales } =
    resolved;
  const shared = {
    groups,
    region: options.region,
    page,
    locale,
    defaultLocale,
    enabledLocales,
    appContext: options.appContext,
  };

  let element: ReactElement<Record<string, unknown>>;
  if (slotOptions.editMode && Editable) {
    const editable = (
      <Editable
        {...shared}
        edit={{ editorOrigin: resolved.editorOrigin ?? "" }}
        data={resolved.data}
        resolvedContent={resolved.resolvedContent}
      />
    );
    element = resolved.unavailable ? (
      <>
        <LayoutUnavailableCard
          region={options.region}
          unavailable={resolved.unavailable}
        />
        {editable}
      </>
    ) : (
      editable
    );
  } else {
    element = (
      <CmssyServerLayout
        {...shared}
        blocks={options.blocks}
        config={config}
        preview={slotOptions.preview}
      />
    );
  }

  return {
    groups,
    ...(resolved.unavailable ? { unavailable: resolved.unavailable } : {}),
    settings: settings as CmssyRegionSettingsOf<C, P> | null,
    page,
    locale,
    defaultLocale,
    enabledLocales,
    element,
  };
}
