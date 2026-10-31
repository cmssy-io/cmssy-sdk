import type { CmssyClientConfig } from "../content/content-client";
import { typedOperation } from "./document";
import { graphqlRequest, type GraphqlRequestOptions } from "./graphql-request";
import { CmssyGraphqlError } from "./http";

export interface CmssyMaintenance {
  startsAt: string;
  endsAt: string;
}

export interface MaintenanceResult {
  public: { maintenance: CmssyMaintenance | null };
}

export const MAINTENANCE_QUERY = typedOperation<
  MaintenanceResult,
  Record<string, never>
>(`query PublicMaintenance {
  public {
    maintenance {
      startsAt
      endsAt
    }
  }
}`);

export async function getMaintenance(
  config: CmssyClientConfig,
  options: GraphqlRequestOptions = {},
): Promise<CmssyMaintenance | null> {
  const data = await graphqlRequest(
    config,
    MAINTENANCE_QUERY,
    {},
    { ...options, public: true },
    "maintenance query",
  );
  return data.public?.maintenance ?? null;
}

export interface CmssyMaintenanceRefusal {
  endsAt: string | null;
  retryAfter: number | null;
}

export function maintenanceRefusal(
  error: unknown,
): CmssyMaintenanceRefusal | null {
  if (!(error instanceof CmssyGraphqlError)) return null;
  for (const entry of error.errors) {
    const ext = entry.extensions;
    if (ext?.code !== "MAINTENANCE") continue;
    return {
      endsAt: typeof ext.endsAt === "string" ? ext.endsAt : null,
      retryAfter: typeof ext.retryAfter === "number" ? ext.retryAfter : null,
    };
  }
  return null;
}
