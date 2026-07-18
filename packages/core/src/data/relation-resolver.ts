import type { CmssyModelRecord, FieldDefinition } from "@cmssy/types";
import type { CmssyClientConfig } from "../content/content-client";
import { createCmssyClient } from "./client";
import type { QueryScopedOptions } from "./client";
import { MODEL_RECORDS_QUERY } from "./queries";

export const RECORDS_BY_IDS_QUERY = `query PublicRecordsByIds($workspaceId: String!, $ids: [String!]!, $locale: String) {
  public {
    model {
      recordsByIds(workspaceId: $workspaceId, ids: $ids, locale: $locale) {
        id modelId data status createdAt updatedAt
      }
    }
  }
}`;

const BY_IDS_CHUNK = 50;
const COLLECTION_DEFAULT_LIMIT = 50;

export interface RelationContentEntry {
  type: string;
  content: Record<string, unknown>;
}

export type BlockSchemaMap = Record<string, Record<string, FieldDefinition>>;

function relationModel(field: FieldDefinition): string | undefined {
  return field.relationTo?.startsWith("model:")
    ? field.relationTo.slice("model:".length)
    : undefined;
}

function storedIds(value: unknown): string[] {
  if (typeof value === "string" && value) return [value];
  if (Array.isArray(value)) {
    return value.filter((id): id is string => typeof id === "string" && !!id);
  }
  return [];
}

interface RelationRef {
  content: Record<string, unknown>;
  key: string;
  field: FieldDefinition;
  model: string;
}

function collectRefs(
  entries: RelationContentEntry[],
  schemas: BlockSchemaMap,
): RelationRef[] {
  const refs: RelationRef[] = [];
  for (const entry of entries) {
    const schema = schemas[entry.type];
    if (!schema) continue;
    for (const [key, field] of Object.entries(schema)) {
      if (field.type !== "relation") continue;
      const model = relationModel(field);
      if (!model) continue;
      refs.push({ content: entry.content, key, field, model });
    }
  }
  return refs;
}

function isResolvedRecord(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { data?: unknown }).data === "object"
  );
}

function isListShaped(field: FieldDefinition): boolean {
  return (
    field.relationMode === "all" ||
    field.relationType === "hasMany" ||
    field.multiple === true
  );
}

/**
 * The editor canvas renders stored content without the server-side resolve, so
 * a relation field there holds raw ids - or the "" a freshly inserted block is
 * seeded with. A component is typed against resolved records, so anything that
 * is not one falls back to the server-resolved value for that key (the admin
 * hydrates the canvas with raw stored content, clobbering it), and only then
 * to the safe empty shape.
 */
export function normalizeRelationContent(
  content: Record<string, unknown>,
  schema: Record<string, FieldDefinition>,
  resolved?: Record<string, unknown>,
): void {
  for (const [key, field] of Object.entries(schema)) {
    if (field.type !== "relation") continue;
    const value = content[key];
    const fallback = resolved?.[key];
    if (isListShaped(field)) {
      if (Array.isArray(value)) {
        const records = value.filter(isResolvedRecord);
        if (records.length > 0 || value.length === 0) {
          content[key] = records;
          continue;
        }
      }
      content[key] = Array.isArray(fallback)
        ? fallback.filter(isResolvedRecord)
        : [];
    } else if (!isResolvedRecord(value)) {
      if (value != null && value !== "" && isResolvedRecord(fallback)) {
        content[key] = fallback;
      } else {
        delete content[key];
      }
    }
  }
}

function collectionKey(ref: RelationRef): string {
  return [ref.model, ref.field.sort ?? "", ref.field.limit ?? ""].join("\u0000");
}

/**
 * Resolves every `fields.relation` value on the given block contents in place:
 * stored record ids become full records (one batched read for the whole page),
 * and a `mode: "all"` field becomes the model's record list. A dangling id and
 * a failed fetch both degrade to "no value" - a relation must never break a
 * render.
 */
export async function resolveRelationContent(
  config: CmssyClientConfig,
  entries: RelationContentEntry[],
  schemas: BlockSchemaMap,
  locale?: string,
  requestOptions: QueryScopedOptions = {},
): Promise<void> {
  const refs = collectRefs(entries, schemas);
  if (refs.length === 0) return;

  const client = createCmssyClient(config);

  const pickedIds = new Set<string>();
  const collections = new Map<
    string,
    { model: string; sort?: string; limit?: number }
  >();
  for (const ref of refs) {
    if (ref.field.relationMode === "all") {
      collections.set(collectionKey(ref), {
        model: ref.model,
        sort: ref.field.sort,
        limit: ref.field.limit,
      });
    } else {
      for (const id of storedIds(ref.content[ref.key])) pickedIds.add(id);
    }
  }

  let recordsById: Map<string, CmssyModelRecord>;
  let collectionItems: Map<string, CmssyModelRecord[]>;
  try {
    [recordsById, collectionItems] = await Promise.all([
      fetchPickedRecords(client, [...pickedIds], locale, requestOptions),
      fetchCollections(client, collections, locale, requestOptions),
    ]);
  } catch (err) {
    if (typeof console !== "undefined") {
      console.error("[cmssy] relation resolution failed", err);
    }
    for (const ref of refs) {
      if (
        ref.field.relationMode === "all" ||
        Array.isArray(ref.content[ref.key])
      ) {
        ref.content[ref.key] = [];
      } else {
        delete ref.content[ref.key];
      }
    }
    return;
  }

  for (const ref of refs) {
    if (ref.field.relationMode === "all") {
      ref.content[ref.key] = collectionItems.get(collectionKey(ref)) ?? [];
      continue;
    }
    const value = ref.content[ref.key];
    if (Array.isArray(value)) {
      ref.content[ref.key] = storedIds(value)
        .map((id) => recordsById.get(id))
        .filter((record): record is CmssyModelRecord => !!record);
    } else if (typeof value === "string" && value) {
      const record = recordsById.get(value);
      if (record) ref.content[ref.key] = record;
      else delete ref.content[ref.key];
    } else {
      delete ref.content[ref.key];
    }
  }
}

async function fetchPickedRecords(
  client: ReturnType<typeof createCmssyClient>,
  ids: string[],
  locale?: string,
  requestOptions: QueryScopedOptions = {},
): Promise<Map<string, CmssyModelRecord>> {
  const byId = new Map<string, CmssyModelRecord>();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += BY_IDS_CHUNK) {
    chunks.push(ids.slice(i, i + BY_IDS_CHUNK));
  }
  await Promise.all(
    chunks.map(async (chunk) => {
      const result = await client.queryScoped<{
        public: { model: { recordsByIds: CmssyModelRecord[] } };
      }>(
        RECORDS_BY_IDS_QUERY,
        { ids: chunk, locale: locale ?? null },
        requestOptions,
      );
      for (const record of result.public.model.recordsByIds) {
        byId.set(record.id, record);
      }
    }),
  );
  return byId;
}

async function fetchCollections(
  client: ReturnType<typeof createCmssyClient>,
  collections: Map<string, { model: string; sort?: string; limit?: number }>,
  locale?: string,
  requestOptions: QueryScopedOptions = {},
): Promise<Map<string, CmssyModelRecord[]>> {
  const byKey = new Map<string, CmssyModelRecord[]>();
  await Promise.all(
    [...collections.entries()].map(async ([key, { model, sort, limit }]) => {
      const result = await client.queryScoped<{
        public: { model: { records: { items: CmssyModelRecord[] } } };
      }>(
        MODEL_RECORDS_QUERY,
        {
          modelSlug: model,
          sort: sort ?? null,
          limit: limit ?? COLLECTION_DEFAULT_LIMIT,
          locale: locale ?? null,
        },
        requestOptions,
      );
      byKey.set(key, result.public.model.records.items);
    }),
  );
  return byKey;
}
