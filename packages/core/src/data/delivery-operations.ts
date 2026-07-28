import {
  PUBLIC_PAGES_QUERY,
  PUBLIC_PAGE_BY_ID_QUERY,
  PUBLIC_PAGE_LAYOUTS_QUERY,
  PUBLIC_PAGE_META_QUERY,
  PUBLIC_PAGE_QUERY,
} from "../content/content-client";
import { RECORDS_BY_IDS_QUERY } from "./relation-resolver";
import {
  FORM_QUERY,
  MODEL_RECORDS_QUERY,
  SITE_CONFIG_QUERY,
  SUBMIT_FORM_MUTATION,
} from "./queries";

export interface CmssyDeliveryOperation {
  /** One line, for the generated file - why an app would want this one. */
  purpose: string;
  document: string;
}

/**
 * The delivery operations the SDK itself performs, for `cmssy types` to vendor
 * into an app.
 *
 * These reference the runtime constants rather than restating them: a second
 * copy here would be free to drift from the client that actually sends them,
 * which is the problem this list exists to remove. Keep it that way - a literal
 * moved into this file also drops out of `sdl-operations.test.ts`, which
 * validates exported document *strings* in their home modules.
 *
 * Deliberately absent, and why:
 *
 * - `PUBLIC_PAGE_DEV_QUERY` - a second document named `PublicPage`. Two
 *   documents cannot share an operation name in graphql-codegen's client
 *   preset, so including it would emit a file every consumer's codegen
 *   rejects. It is also a dev-preview path an app never calls itself.
 * - `MODEL_DEFINITIONS_QUERY` - `cmssy types` already turns definitions into
 *   TypeScript; fetching them at runtime is not something an app does.
 */
export const CMSSY_DELIVERY_OPERATIONS: readonly CmssyDeliveryOperation[] = [
  {
    purpose: "Languages, branding and the 404 page - the workspace's settings.",
    document: SITE_CONFIG_QUERY,
  },
  {
    purpose: "One page with its blocks. `previewSecret` returns the draft.",
    document: PUBLIC_PAGE_QUERY,
  },
  {
    purpose: "One page by id - what the workspace's 404 page setting stores.",
    document: PUBLIC_PAGE_BY_ID_QUERY,
  },
  {
    purpose: "The published page list - sitemaps, and static params.",
    document: PUBLIC_PAGES_QUERY,
  },
  {
    purpose: "SEO fields for one page, without fetching its blocks.",
    document: PUBLIC_PAGE_META_QUERY,
  },
  {
    purpose: "Header, footer and the other layout positions for a page.",
    document: PUBLIC_PAGE_LAYOUTS_QUERY,
  },
  {
    purpose: "Records of one model - the typed half of `cmssy types`.",
    document: MODEL_RECORDS_QUERY,
  },
  {
    purpose: "Records by id - how a relation field resolves to records.",
    document: RECORDS_BY_IDS_QUERY,
  },
  {
    purpose: "A form definition, for rendering and validating it.",
    document: FORM_QUERY,
  },
  {
    purpose: "Submitting that form - rendering one without this is half a feature.",
    document: SUBMIT_FORM_MUTATION,
  },
];
