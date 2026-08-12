import type { CmssyModelRecord, FieldDefinition, PageRef } from "@cmssy/types";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const BLOCK_BUCKETS = ["content", "style", "advanced"] as const;
export type BlockBucket = (typeof BLOCK_BUCKETS)[number];

/**
 * Which bucket the editor writes a field into. `tab` decides, content is the
 * default - a field on the style or advanced tab is stored under `block.style`
 * or `block.advanced`, not in the block's content.
 */
export function bucketOf(field: FieldDefinition): BlockBucket {
  return field.tab === "style" || field.tab === "advanced"
    ? field.tab
    : "content";
}

export type FieldVisitor = (
  holder: Record<string, unknown>,
  key: string,
  field: FieldDefinition,
  path: readonly (string | number)[],
) => void;

/**
 * Visits every declared field of a block's values, descending into repeater
 * rows so a field nested in a repeater is reached on the same terms as a
 * top-level one.
 *
 * `copyRows` is for callers that write through the holder they are handed. The
 * values a block receives are only shallow-copied out of the stored document
 * (`getBlockContentForLanguage`), so a repeater row is still shared with it;
 * copying the rows first is what keeps a write from reaching the original. A
 * caller that only reads leaves it off and mutates nothing.
 *
 * `bucket` keeps a caller that holds one bucket from acting on fields stored in
 * another: a schema describes all three, so walking it against content alone
 * would read - and write - keys that live under `block.style` or
 * `block.advanced`. Only a top-level field carries a tab; inside a repeater row
 * there are no tabs, so the rows go with whatever bucket the repeater is in.
 */
export function walkBlockFields(
  values: Record<string, unknown>,
  schema: Record<string, FieldDefinition>,
  visit: FieldVisitor,
  options: { copyRows?: boolean; bucket?: BlockBucket } = {},
  path: readonly (string | number)[] = [],
): void {
  for (const [key, field] of Object.entries(schema)) {
    if (
      options.bucket &&
      path.length === 0 &&
      bucketOf(field) !== options.bucket
    ) {
      continue;
    }
    if (field.type === "repeater") {
      const itemSchema = field.itemSchema;
      const stored = values[key];
      if (!itemSchema || !Array.isArray(stored)) continue;
      const rows = options.copyRows
        ? stored.map((row) => (isRecord(row) ? { ...row } : row))
        : stored;
      if (options.copyRows) values[key] = rows;
      rows.forEach((row, index) => {
        if (isRecord(row)) {
          walkBlockFields(row, itemSchema, visit, options, [
            ...path,
            key,
            index,
          ]);
        }
      });
      continue;
    }
    visit(values, key, field, path);
  }
}

function collectRefs(
  entries: RelationContentEntry[],
  schemas: BlockSchemaMap,
): RelationRef[] {
  const refs: RelationRef[] = [];
  for (const entry of entries) {
    const schema = schemas[entry.type];
    if (!schema) continue;
    walkBlockFields(
      entry.content,
      schema,
      (holder, key, field) => {
        if (field.type !== "relation") return;
        const model = relationModel(field);
        if (!model) return;
        refs.push({ content: holder, key, field, model });
      },
      { copyRows: true, bucket: "content" },
    );
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
 * A page reference as the admin writes it today, or the bare slug written
 * before a page selector carried the display name. Reading the old shape here
 * is what lets `fields.pageSelector` promise `PageRef` for every stored value.
 */
function toPageRef(value: unknown): PageRef | null {
  if (typeof value === "string") {
    return value ? { slug: value, displayName: {} } : null;
  }
  if (isRecord(value) && typeof value.slug === "string" && value.slug) {
    return value as unknown as PageRef;
  }
  return null;
}

function toPageRefs(value: unknown): PageRef[] {
  const items = Array.isArray(value) ? value : [value];
  return items.map(toPageRef).filter((ref): ref is PageRef => ref !== null);
}

/**
 * Puts a declared `defaultValue` in place when the author left the field empty.
 *
 * Only an absent or cleared value counts as empty - the editor writes `null`
 * when a field is cleared, and an empty string is a deliberate blank, not a
 * missing value. Without this the default is decorative: it seeds the editor
 * and nothing else, so every block still restates it as `content.x ?? default`.
 */
function applyDefault(
  holder: Record<string, unknown>,
  key: string,
  field: FieldDefinition,
): void {
  if (field.defaultValue === undefined) return;
  const value = holder[key];
  if (value === undefined || value === null) holder[key] = field.defaultValue;
}

/** Walks `path` (repeater key / row index pairs) into the server-resolved content. */
function fallbackHolder(
  resolved: Record<string, unknown> | undefined,
  path: readonly (string | number)[],
): Record<string, unknown> | undefined {
  let holder: unknown = resolved;
  for (const step of path) {
    if (holder === undefined || holder === null) return undefined;
    holder = (holder as Record<string | number, unknown>)[step];
  }
  return isRecord(holder) ? holder : undefined;
}

/**
 * Brings stored content in line with what the block's schema declares, for the
 * field types whose stored shape differs from the authored one: a relation
 * carries ids, a page selector always carries a list even when it holds one
 * page.
 */
export function normalizeBlockContent(
  content: Record<string, unknown>,
  schema: Record<string, FieldDefinition>,
  resolved?: Record<string, unknown>,
): void {
  walkBlockFields(
    content,
    schema,
    (holder, key, field, path) => {
      if (field.type === "pageSelector") {
        const present = key in holder && holder[key] != null;
        let refs = present ? toPageRefs(holder[key]) : [];
        if (refs.length === 0) refs = toPageRefs(field.defaultValue);
        if (field.multiple === false) {
          if (refs[0]) holder[key] = refs[0];
          else delete holder[key];
        } else if (present || refs.length > 0) {
          holder[key] = refs;
        }
        return;
      }

      if (field.type !== "relation") {
        applyDefault(holder, key, field);
        return;
      }

      const value = holder[key];
      const fallback = fallbackHolder(resolved, path)?.[key];
      if (isListShaped(field)) {
        if (Array.isArray(value)) {
          const records = value.filter(isResolvedRecord);
          if (records.length > 0 || value.length === 0) {
            holder[key] = records;
            return;
          }
        }
        holder[key] = Array.isArray(fallback)
          ? fallback.filter(isResolvedRecord)
          : [];
      } else if (!isResolvedRecord(value)) {
        if (value != null && value !== "" && isResolvedRecord(fallback)) {
          holder[key] = fallback;
        } else {
          delete holder[key];
        }
      }
    },
    { copyRows: true, bucket: "content" },
  );
}

function collectionKey(ref: RelationRef): string {
  return [ref.model, ref.field.sort ?? "", ref.field.limit ?? ""].join(
    "\u0000",
  );
}

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
