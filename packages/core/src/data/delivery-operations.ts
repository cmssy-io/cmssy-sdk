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
  purpose: string;
  document: string;
}

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
