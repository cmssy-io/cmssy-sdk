/**
 * Accepting a *typed* document, not a string, is what makes a query's variables
 * and its result checked together. graphql-codegen emits one of three shapes,
 * and the SDK takes all of them so an app never has to care which mode its
 * codegen runs in - or add `graphql` to its runtime dependencies to print an
 * AST it already has.
 */

/**
 * A document that carries its result and variable types. Structurally
 * compatible with `TypedDocumentNode` (`@graphql-typed-document-node/core`) and
 * with graphql-codegen's `TypedDocumentString`, both of which declare the same
 * phantom `__apiType`.
 */
export interface CmssyTypedDocument<Result, Variables> {
  __apiType?: (variables: Variables) => Result;
}

interface AstNode {
  kind: string;
  [key: string]: unknown;
}

function isNode(value: unknown): value is AstNode {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AstNode).kind === "string"
  );
}

function name(node: unknown): string {
  return isNode(node) ? String((node as { value?: unknown }).value ?? "") : "";
}

function printValue(node: unknown): string {
  if (!isNode(node)) return "null";
  const value = (node as { value?: unknown }).value;
  switch (node.kind) {
    case "Variable":
      return `$${name((node as { name?: unknown }).name)}`;
    case "IntValue":
    case "FloatValue":
    case "BooleanValue":
      return String(value);
    case "StringValue":
      return (node as { block?: boolean }).block
        ? `"""\n${String(value)}\n"""`
        : JSON.stringify(String(value));
    case "EnumValue":
      return String(value);
    case "NullValue":
      return "null";
    case "ListValue":
      return `[${((node as { values?: unknown[] }).values ?? [])
        .map(printValue)
        .join(", ")}]`;
    case "ObjectValue":
      return `{${((node as { fields?: AstNode[] }).fields ?? [])
        .map(
          (field) =>
            `${name((field as { name?: unknown }).name)}: ${printValue(
              (field as { value?: unknown }).value,
            )}`,
        )
        .join(", ")}}`;
    default:
      return "null";
  }
}

function printType(node: unknown): string {
  if (!isNode(node)) return "";
  switch (node.kind) {
    case "NonNullType":
      return `${printType((node as { type?: unknown }).type)}!`;
    case "ListType":
      return `[${printType((node as { type?: unknown }).type)}]`;
    default:
      return name((node as { name?: unknown }).name);
  }
}

function printArguments(node: AstNode): string {
  const args = (node as { arguments?: AstNode[] }).arguments ?? [];
  if (args.length === 0) return "";
  return `(${args
    .map(
      (arg) =>
        `${name((arg as { name?: unknown }).name)}: ${printValue(
          (arg as { value?: unknown }).value,
        )}`,
    )
    .join(", ")})`;
}

function printDirectives(node: AstNode): string {
  const directives = (node as { directives?: AstNode[] }).directives ?? [];
  if (directives.length === 0) return "";
  return ` ${directives
    .map(
      (directive) =>
        `@${name((directive as { name?: unknown }).name)}${printArguments(directive)}`,
    )
    .join(" ")}`;
}

function printSelectionSet(node: unknown, depth: number): string {
  if (!isNode(node)) return "";
  const selections = (node as { selections?: AstNode[] }).selections ?? [];
  if (selections.length === 0) return "";
  const pad = "  ".repeat(depth + 1);
  const body = selections
    .map((selection) => `${pad}${printSelection(selection, depth + 1)}`)
    .join("\n");
  return ` {\n${body}\n${"  ".repeat(depth)}}`;
}

function printSelection(node: AstNode, depth: number): string {
  if (node.kind === "FragmentSpread") {
    return `...${name((node as { name?: unknown }).name)}${printDirectives(node)}`;
  }
  if (node.kind === "InlineFragment") {
    const condition = (node as { typeCondition?: unknown }).typeCondition;
    const on = isNode(condition)
      ? ` on ${name((condition as { name?: unknown }).name)}`
      : "";
    return `...${on}${printDirectives(node)}${printSelectionSet(
      (node as { selectionSet?: unknown }).selectionSet,
      depth,
    )}`;
  }
  const alias = (node as { alias?: unknown }).alias;
  const prefix = isNode(alias) ? `${name(alias)}: ` : "";
  return `${prefix}${name((node as { name?: unknown }).name)}${printArguments(
    node,
  )}${printDirectives(node)}${printSelectionSet(
    (node as { selectionSet?: unknown }).selectionSet,
    depth,
  )}`;
}

function printVariableDefinitions(node: AstNode): string {
  const definitions =
    (node as { variableDefinitions?: AstNode[] }).variableDefinitions ?? [];
  if (definitions.length === 0) return "";
  return `(${definitions
    .map((definition) => {
      const variable = (definition as { variable?: unknown }).variable;
      const declared = `$${name(
        isNode(variable) ? (variable as { name?: unknown }).name : undefined,
      )}: ${printType((definition as { type?: unknown }).type)}`;
      const defaultValue = (definition as { defaultValue?: unknown })
        .defaultValue;
      return isNode(defaultValue)
        ? `${declared} = ${printValue(defaultValue)}`
        : declared;
    })
    .join(", ")})`;
}

function printDefinition(node: AstNode): string {
  if (node.kind === "FragmentDefinition") {
    const condition = (node as { typeCondition?: unknown }).typeCondition;
    const on = isNode(condition)
      ? name((condition as { name?: unknown }).name)
      : "";
    return `fragment ${name((node as { name?: unknown }).name)} on ${on}${printDirectives(
      node,
    )}${printSelectionSet((node as { selectionSet?: unknown }).selectionSet, 0)}`;
  }
  const operation = String(
    (node as { operation?: unknown }).operation ?? "query",
  );
  const operationName = name((node as { name?: unknown }).name);
  const head = operationName ? `${operation} ${operationName}` : operation;
  return `${head}${printVariableDefinitions(node)}${printDirectives(
    node,
  )}${printSelectionSet((node as { selectionSet?: unknown }).selectionSet, 0)}`;
}

/**
 * Prints the AST subset graphql-codegen emits. Deliberately not a general
 * GraphQL printer: it exists so a consumer does not have to ship the `graphql`
 * runtime just to hand the SDK a document it already generated.
 */
function printDocumentNode(node: AstNode): string {
  const definitions = (node as { definitions?: AstNode[] }).definitions ?? [];
  return definitions.map(printDefinition).join("\n\n");
}

/**
 * The query text of whatever the caller passed: a string, a
 * `TypedDocumentString`, or a `TypedDocumentNode` (with or without the `loc`
 * the parser attaches - codegen strips it).
 */
export function documentText(document: unknown): string {
  if (typeof document === "string") return document;
  if (!document || typeof document !== "object") {
    throw new TypeError(
      "cmssy: expected a GraphQL document - a query string, a TypedDocumentString, or a TypedDocumentNode",
    );
  }

  // The parser keeps the source it read; codegen's inlined AST does not.
  const loc = (document as { loc?: { source?: { body?: unknown } } }).loc;
  if (typeof loc?.source?.body === "string") return loc.source.body;

  if ((document as AstNode).kind === "Document") {
    const printed = printDocumentNode(document as AstNode);
    if (printed.trim()) return printed;
  }

  const asString = String(document);
  if (asString && asString !== "[object Object]") return asString;

  throw new TypeError(
    "cmssy: could not read the query text off the given document",
  );
}
