import type { CmssyClientConfig } from "../content/content-client";
import { graphqlRequest, type GraphqlRequestOptions } from "./graphql-request";
import { resolveWorkspaceId } from "./settings-client";

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

export interface FetchRecordsOptions extends GraphqlRequestOptions {
  workspaceId?: string;
  filter?: Record<string, unknown>;
  sort?: string;
  limit?: number;
  offset?: number;
  populate?: string[];
}

const MODEL_DEFINITIONS_QUERY = `query PublicModelDefinitions($workspaceId: String!) {
  publicModelDefinitions(workspaceId: $workspaceId) {
    id name slug description icon color displayField recordCount
  }
}`;

const MODEL_RECORDS_QUERY = `query PublicModelRecords($workspaceId: String!, $modelSlug: String!, $filter: JSON, $sort: String, $limit: Int, $offset: Int, $populate: [String!]) {
  publicModelRecords(workspaceId: $workspaceId, modelSlug: $modelSlug, filter: $filter, sort: $sort, limit: $limit, offset: $offset, populate: $populate) {
    items { id modelId data status createdAt updatedAt }
    total
    hasMore
  }
}`;

export async function fetchModelDefinitions(
  config: CmssyClientConfig,
  options: { workspaceId?: string } & GraphqlRequestOptions = {},
): Promise<CmssyModelDefinition[]> {
  const { workspaceId: provided, ...requestOptions } = options;
  const workspaceId =
    provided ?? (await resolveWorkspaceId(config, requestOptions));
  const data = await graphqlRequest<{
    publicModelDefinitions?: CmssyModelDefinition[] | null;
  }>(
    config,
    MODEL_DEFINITIONS_QUERY,
    { workspaceId },
    requestOptions,
    "model definitions query",
  );
  return data.publicModelDefinitions ?? [];
}

export async function fetchRecords(
  config: CmssyClientConfig,
  modelSlug: string,
  options: FetchRecordsOptions = {},
): Promise<CmssyRecordList> {
  const {
    workspaceId: provided,
    filter,
    sort,
    limit,
    offset,
    populate,
    ...requestOptions
  } = options;
  const workspaceId =
    provided ?? (await resolveWorkspaceId(config, requestOptions));
  const data = await graphqlRequest<{
    publicModelRecords?: CmssyRecordList | null;
  }>(
    config,
    MODEL_RECORDS_QUERY,
    {
      workspaceId,
      modelSlug,
      filter: filter ?? null,
      sort: sort ?? null,
      limit: limit ?? null,
      offset: offset ?? null,
      populate: populate ?? null,
    },
    requestOptions,
    "records query",
  );
  return data.publicModelRecords ?? { items: [], total: 0, hasMore: false };
}
