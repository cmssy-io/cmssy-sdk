import type { CmssyClientConfig } from "../content/content-client";
import { graphqlRequest, type GraphqlRequestOptions } from "./graphql-request";
import { resolveWorkspaceId } from "./settings-client";

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
  showIf: unknown;
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

const FORM_QUERY = `query PublicForm($formId: ID!) {
  publicForm(formId: $formId) {
    id
    name
    slug
    description
    fields {
      id name fieldType label placeholder helpText
      defaultValue options validation width order showIf
    }
    settings {
      actionType submitButtonLabel successMessage errorMessage
      redirectUrl requireLogin enableCaptcha
    }
  }
}`;

const SUBMIT_FORM_MUTATION = `mutation SubmitForm($formId: ID!, $input: SubmitFormInput!) {
  submitForm(formId: $formId, input: $input) {
    success message submissionId redirectUrl accessToken customer
  }
}`;

export interface FetchFormOptions extends GraphqlRequestOptions {
  workspaceId?: string;
}

export async function fetchForm(
  config: CmssyClientConfig,
  formId: string,
  options: FetchFormOptions = {},
): Promise<CmssyFormDefinition | null> {
  const { workspaceId: provided, ...requestOptions } = options;
  const workspaceId =
    provided ?? (await resolveWorkspaceId(config, requestOptions));
  const data = await graphqlRequest<{
    publicForm?: CmssyFormDefinition | null;
  }>(
    config,
    FORM_QUERY,
    { formId },
    {
      ...requestOptions,
      headers: { ...requestOptions.headers, "x-workspace-id": workspaceId },
    },
    "form query",
  );
  return data.publicForm ?? null;
}

export interface SubmitFormOptions extends GraphqlRequestOptions {
  website?: string;
}

export async function submitForm(
  config: CmssyClientConfig,
  formId: string,
  values: Record<string, unknown>,
  options: SubmitFormOptions = {},
): Promise<CmssyFormSubmitResponse> {
  const { website, ...requestOptions } = options;
  const data = await graphqlRequest<{
    submitForm: CmssyFormSubmitResponse;
  }>(
    config,
    SUBMIT_FORM_MUTATION,
    { formId, input: { data: values, website: website ?? "" } },
    requestOptions,
    "form submission",
  );
  return data.submitForm;
}
