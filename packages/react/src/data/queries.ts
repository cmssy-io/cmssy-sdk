import type { FieldConditionGroup } from "@cmssy/types";

export interface CmssyBranding {
  brandName: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
}

export interface CmssySiteConfig {
  id: string;
  workspaceId: string;
  siteName: unknown;
  defaultLanguage: string | null;
  enabledLanguages: string[];
  enabledFeatures: string[];
  notFoundPageId: string | null;
  previewUrl: string | null;
  branding: CmssyBranding | null;
}

export const SITE_CONFIG_QUERY = `query PublicSiteConfig($workspaceSlug: String!) {
  public {
    siteConfig(workspaceSlug: $workspaceSlug) {
      id
      workspaceId
      siteName
      defaultLanguage
      enabledLanguages
      enabledFeatures
      notFoundPageId
      previewUrl
      branding {
        brandName
        logoUrl
        faviconUrl
        ogImageUrl
      }
    }
  }
}`;

export interface CmssyModelDefinition {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  displayField: string | null;
  recordCount: number | null;
}

export interface CmssyModelRecord {
  id: string;
  modelId: string;
  data: Record<string, unknown>;
  status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CmssyRecordList {
  items: CmssyModelRecord[];
  total: number;
  hasMore: boolean;
}

export const MODEL_DEFINITIONS_QUERY = `query PublicModelDefinitions($workspaceId: String!) {
  publicModelDefinitions(workspaceId: $workspaceId) {
    id name slug description icon color displayField recordCount
  }
}`;

export const MODEL_RECORDS_QUERY = `query PublicModelRecords($workspaceId: String!, $modelSlug: String!, $filter: JSON, $sort: String, $limit: Int, $offset: Int, $populate: [String!]) {
  publicModelRecords(workspaceId: $workspaceId, modelSlug: $modelSlug, filter: $filter, sort: $sort, limit: $limit, offset: $offset, populate: $populate) {
    items { id modelId data status createdAt updatedAt }
    total
    hasMore
  }
}`;

export interface CmssyFormField {
  id: string;
  name: string;
  fieldType: string;
  label: string | null;
  placeholder: string | null;
  helpText: string | null;
  defaultValue: unknown;
  options: unknown;
  validation: unknown;
  width: string | null;
  order: number | null;
  showWhen: FieldConditionGroup | null;
  requiredWhen: FieldConditionGroup | null;
}

export interface CmssyFormSettings {
  actionType: string | null;
  submitButtonLabel: unknown;
  successMessage: unknown;
  errorMessage: unknown;
  redirectUrl: string | null;
  requireLogin: boolean | null;
  enableCaptcha: boolean | null;
}

export interface CmssyFormDefinition {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  fields: CmssyFormField[];
  settings: CmssyFormSettings | null;
}

export interface CmssyFormSubmitResponse {
  success: boolean;
  message: string | null;
  submissionId: string | null;
  redirectUrl: string | null;
  accessToken: string | null;
  customer: unknown;
}

export interface SubmitFormInput {
  data: Record<string, unknown>;
  website?: string;
}

export const FORM_QUERY = `query PublicForm($formId: ID!) {
  publicForm(formId: $formId) {
    id
    name
    slug
    description
    fields {
      id name fieldType label placeholder helpText
      defaultValue width order showWhen requiredWhen
      options { value label disabled }
      validation { required minLength maxLength minValue maxValue pattern customMessage }
    }
    settings {
      actionType submitButtonLabel successMessage errorMessage
      redirectUrl requireLogin enableCaptcha
    }
  }
}`;

export const SUBMIT_FORM_MUTATION = `mutation SubmitForm($formId: ID!, $input: SubmitFormInput!) {
  submitForm(formId: $formId, input: $input) {
    success message submissionId redirectUrl accessToken customer
  }
}`;
