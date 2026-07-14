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

// These data shapes live in @cmssy/types; re-exported for consumers.
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

export const MODEL_DEFINITIONS_QUERY = `query PublicModelDefinitions($workspaceId: String!) {
  public {
    model {
      definitions(workspaceId: $workspaceId) {
        id name slug description icon color displayField recordCount
      }
    }
  }
}`;

export const MODEL_RECORDS_QUERY = `query PublicModelRecords($workspaceId: String!, $modelSlug: String!, $filter: JSON, $sort: String, $locale: String, $limit: Int, $offset: Int, $populate: [String!]) {
  public {
    model {
      records(workspaceId: $workspaceId, modelSlug: $modelSlug, filter: $filter, sort: $sort, locale: $locale, limit: $limit, offset: $offset, populate: $populate) {
        items { id modelId data status createdAt updatedAt }
        total
        hasMore
      }
    }
  }
}`;

export const FORM_QUERY = `query PublicForm($formId: ID!) {
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
          redirectUrl requireLogin enableCaptcha
        }
      }
    }
  }
}`;

export const SUBMIT_FORM_MUTATION = `mutation SubmitForm($formId: ID!, $input: SubmitFormInput!) {
  public {
    form {
      submit(formId: $formId, input: $input) {
        success message submissionId redirectUrl accessToken customer
      }
    }
  }
}`;
