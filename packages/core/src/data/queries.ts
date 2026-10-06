import { brandingFieldNames } from "@cmssy/types";
import { typedOperation } from "./document";
import type {
  CmssyBranding,
  CmssySiteConfig,
  CmssyModelDefinition,
  CmssyModelRecord,
  CmssyRecordList,
  CmssyFormField,
  CmssyFormSettings,
  CmssyFormDefinition,
  CmssyFormSubmitResponse,
  SubmitFormInput,
} from "@cmssy/types";

export type {
  CmssyBranding,
  CmssySiteConfig,
  CmssyModelDefinition,
  CmssyModelRecord,
  CmssyRecordList,
  CmssyFormField,
  CmssyFormSettings,
  CmssyFormDefinition,
  CmssyFormSubmitResponse,
  SubmitFormInput,
};

export interface SiteConfigVariables {
  workspaceSlug: string;
}

export interface SiteConfigResult {
  public: { siteConfig: CmssySiteConfig | null };
}

export const SITE_CONFIG_QUERY = typedOperation<
  SiteConfigResult,
  SiteConfigVariables
>(`query PublicSiteConfig($workspaceSlug: String!) {
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
        ${brandingFieldNames.join("\n        ")}
      }
    }
  }
}`);

export interface ModelDefinitionsVariables {
  workspaceId: string;
}

export interface ModelDefinitionsResult {
  public: { model: { definitions: CmssyModelDefinition[] } };
}

export const MODEL_DEFINITIONS_QUERY = typedOperation<
  ModelDefinitionsResult,
  ModelDefinitionsVariables
>(`query PublicModelDefinitions($workspaceId: String!) {
  public {
    model {
      definitions(workspaceId: $workspaceId) {
        id name slug description icon color displayField recordCount
      }
    }
  }
}`);

export interface ModelRecordsVariables {
  workspaceId: string;
  modelSlug: string;
  filter?: Record<string, unknown> | null;
  sort?: string | null;
  locale?: string | null;
  limit?: number | null;
  offset?: number | null;
  populate?: string[] | null;
}

export interface ModelRecordsResult {
  public: { model: { records: CmssyRecordList } };
}

export const MODEL_RECORDS_QUERY = typedOperation<
  ModelRecordsResult,
  ModelRecordsVariables
>(`query PublicModelRecords($workspaceId: String!, $modelSlug: String!, $filter: JSON, $sort: String, $locale: String, $limit: Int, $offset: Int, $populate: [String!]) {
  public {
    model {
      records(workspaceId: $workspaceId, modelSlug: $modelSlug, filter: $filter, sort: $sort, locale: $locale, limit: $limit, offset: $offset, populate: $populate) {
        items { id modelId data status createdAt updatedAt }
        total
        hasMore
      }
    }
  }
}`);

export interface FormVariables {
  formId: string;
}

export interface FormResult {
  public: { form: { get: CmssyFormDefinition | null } };
}

export const FORM_QUERY = typedOperation<FormResult, FormVariables>(
  `query PublicForm($formId: ID!) {
  public {
    form {
      get(formId: $formId) {
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
          redirectUrl requireLogin
        }
      }
    }
  }
}`);

export interface SubmitFormVariables {
  formId: string;
  input: SubmitFormInput;
}

export interface SubmitFormResult {
  public: { form: { submit: CmssyFormSubmitResponse } };
}

export const SUBMIT_FORM_MUTATION = typedOperation<
  SubmitFormResult,
  SubmitFormVariables
>(`mutation SubmitForm($formId: ID!, $input: SubmitFormInput!) {
  public {
    form {
      submit(formId: $formId, input: $input) {
        success message submissionId redirectUrl
      }
    }
  }
}`);
