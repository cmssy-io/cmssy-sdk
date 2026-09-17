import {
  CmssyLayoutRegion,
  type CmssyBlockPage,
  type CmssyLayoutGroup,
} from "@cmssy/react";
import { CmssyLazyLayout } from "@cmssy/react/client";
import type { CmssyRegion } from "@cmssy/astro";
import type { layout } from "../cmssy.config";
import { blocks } from "./blocks";

export interface LayoutSlotProps {
  groups: CmssyLayoutGroup[];
  region: CmssyRegion<typeof layout>;
  page: CmssyBlockPage;
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  edit?: { editorOrigin: string | string[] };
  data?: Record<string, unknown>;
  resolvedContent?: Record<string, Record<string, unknown>>;
}

export default function LayoutSlot({
  groups,
  region,
  page,
  locale,
  defaultLocale,
  enabledLocales,
  edit,
  data,
  resolvedContent,
}: LayoutSlotProps) {
  if (edit) {
    return (
      <CmssyLazyLayout
        groups={groups}
        region={region}
        page={page}
        locale={locale}
        defaultLocale={defaultLocale}
        enabledLocales={enabledLocales}
        edit={edit}
        data={data}
        resolvedContent={resolvedContent}
        load={() => import("./blocks")}
      />
    );
  }

  return (
    <CmssyLayoutRegion
      groups={groups}
      region={region}
      blocks={blocks}
      page={page}
      locale={locale}
      defaultLocale={defaultLocale}
      enabledLocales={enabledLocales}
      blockData={data}
      blockContent={resolvedContent}
    />
  );
}
