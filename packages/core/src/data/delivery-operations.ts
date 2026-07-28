import {
  PUBLIC_PAGES_QUERY,
  PUBLIC_PAGE_LAYOUTS_QUERY,
  PUBLIC_PAGE_META_QUERY,
  PUBLIC_PAGE_QUERY,
} from "../content/content-client";
import { FORM_QUERY, MODEL_RECORDS_QUERY, SITE_CONFIG_QUERY } from "./queries";

export interface CmssyDeliveryOperation {
  /** The operation name, which is also how codegen will name the document. */
  name: string;
  /** One line, for the generated file - why an app would want this one. */
  purpose: string;
  document: string;
}

/**
 * The delivery reads every cmssy app performs, as the SDK itself performs them.
 *
 * These are not a template. They are the same constants `@cmssy/core` uses at
 * runtime, exported so `cmssy types` can vendor them into an app rather than
 * carry a second copy - a CLI-side template would be one more place for the
 * shape to drift from the client, which is the whole problem being solved.
 *
 * Deliberately absent: `PublicPagesByType`. Every app that has one selects
 * different fields and different variables, and no version of it exists in the
 * SDK - generating one would mean inventing it here, which is the thing this
 * list refuses to do. Write that query in your app.
 */
export const CMSSY_DELIVERY_OPERATIONS: readonly CmssyDeliveryOperation[] = [
  {
    name: "PublicSiteConfig",
    purpose: "Languages, branding and the 404 page - the workspace's settings.",
    document: SITE_CONFIG_QUERY,
  },
  {
    name: "PublicPage",
    purpose: "One page with its blocks. `previewSecret` returns the draft.",
    document: PUBLIC_PAGE_QUERY,
  },
  {
    name: "PublicPages",
    purpose: "The published page list - sitemaps, and static params.",
    document: PUBLIC_PAGES_QUERY,
  },
  {
    name: "PublicPageMeta",
    purpose: "SEO fields for one page, without fetching its blocks.",
    document: PUBLIC_PAGE_META_QUERY,
  },
  {
    name: "PublicPageLayouts",
    purpose: "Header, footer and the other layout positions for a page.",
    document: PUBLIC_PAGE_LAYOUTS_QUERY,
  },
  {
    name: "PublicModelRecords",
    purpose: "Records of one model - the typed half of `cmssy types`.",
    document: MODEL_RECORDS_QUERY,
  },
  {
    name: "PublicForm",
    purpose: "A form definition, for rendering and validating it.",
    document: FORM_QUERY,
  },
];
