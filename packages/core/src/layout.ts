import {
  DEFAULT_LAYOUT_REGIONS,
  LAYOUT_REGION_ID_PATTERN,
  LAYOUT_REGION_LABEL_MAX,
  LAYOUT_REGIONS_MAX,
  type BlockPropsSchema,
  type InferBlockContent,
  type LayoutRegion,
} from "@cmssy/types";

export interface CmssyLayout<
  R extends readonly LayoutRegion[] = readonly LayoutRegion[],
> {
  readonly regions: R;
}

export type CmssyRegion<L extends CmssyLayout> = L["regions"][number]["id"];

export type CmssyRegionSettings<
  L extends CmssyLayout,
  R extends CmssyRegion<L>,
> =
  Extract<L["regions"][number], { id: R }> extends {
    settings: infer S extends BlockPropsSchema;
  }
    ? InferBlockContent<S>
    : Record<string, never>;

export function defineCmssyLayout<const R extends readonly LayoutRegion[]>(
  layout: CmssyLayout<R>,
): CmssyLayout<R> {
  const regions = layout.regions;
  if (!Array.isArray(regions) || regions.length === 0) {
    throw new Error("cmssy: defineCmssyLayout needs at least one region");
  }
  if (regions.length > LAYOUT_REGIONS_MAX) {
    throw new Error(
      `cmssy: a layout declares at most ${LAYOUT_REGIONS_MAX} regions, got ${regions.length}`,
    );
  }
  const seen = new Set<string>();
  for (const region of regions) {
    if (
      typeof region.id !== "string" ||
      !LAYOUT_REGION_ID_PATTERN.test(region.id)
    ) {
      throw new Error(
        `cmssy: layout region id ${JSON.stringify(region.id)} must match ${LAYOUT_REGION_ID_PATTERN}`,
      );
    }
    if (seen.has(region.id)) {
      throw new Error(`cmssy: layout region "${region.id}" is declared twice`);
    }
    seen.add(region.id);
    if (region.label !== undefined) {
      if (
        typeof region.label !== "string" ||
        region.label.trim().length === 0 ||
        region.label.length > LAYOUT_REGION_LABEL_MAX
      ) {
        throw new Error(
          `cmssy: layout region "${region.id}" label must be 1-${LAYOUT_REGION_LABEL_MAX} characters`,
        );
      }
    }
    if (region.settings !== undefined) {
      if (
        typeof region.settings !== "object" ||
        region.settings === null ||
        Array.isArray(region.settings)
      ) {
        throw new Error(
          `cmssy: layout region "${region.id}" settings must be a fields.* schema object`,
        );
      }
    }
  }
  return { regions };
}

export function layoutRegionIds(layout: CmssyLayout | undefined): string[] {
  return (layout?.regions ?? DEFAULT_LAYOUT_REGIONS).map((region) => region.id);
}
