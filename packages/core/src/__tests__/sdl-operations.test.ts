import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSchema,
  isEnumType,
  isInputObjectType,
  isInputType,
  isListType,
  isNonNullType,
  isScalarType,
  Kind,
  parse,
  typeFromAST,
  validate,
  type DocumentNode,
  type GraphQLInputType,
  type OperationDefinitionNode,
} from "graphql";
import { brandingFieldNames } from "@cmssy/types";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { SITE_CONFIG_QUERY } from "../data/queries";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const schemaPath = process.env.CMSSY_SCHEMA_FILE
  ? resolve(repoRoot, process.env.CMSSY_SCHEMA_FILE)
  : resolve(repoRoot, "schema.graphql");
const schema = buildSchema(readFileSync(schemaPath, "utf8"));

const modules = import.meta.glob(
  ["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}", "!../**/*.d.ts"],
  { eager: true },
);

function looksLikeGraphQL(value: string): boolean {
  const body = value.replace(/^(?:\s*#[^\n]*\n)*/, "").trimStart();
  return /^(query|mutation|subscription|fragment)\b/.test(body);
}

type EmbeddedOp = { id: string; doc: DocumentNode };

const operations: EmbeddedOp[] = [];
const parseFailures: string[] = [];
const unnamedOperations: string[] = [];

for (const [path, mod] of Object.entries(modules)) {
  for (const [name, value] of Object.entries(mod)) {
    if (typeof value !== "string") continue;
    let doc: DocumentNode;
    try {
      doc = parse(value);
    } catch (err) {
      if (looksLikeGraphQL(value)) {
        parseFailures.push(`${path}:${name}: ${(err as Error).message}`);
      }
      continue;
    }
    const operationDefs = doc.definitions.filter(
      (d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION,
    );
    if (operationDefs.length === 0) continue;
    if (operationDefs.some((d) => d.name == null)) {
      unnamedOperations.push(`${path}:${name}`);
    }
    operations.push({ id: `${path}:${name}`, doc });
  }
}

describe("SDK operations validate against the backend SDL", () => {
  it("discovers embedded operations", () => {
    expect(operations.length).toBeGreaterThan(0);
  });

  it("every operation-looking string parses", () => {
    expect(parseFailures).toEqual([]);
  });

  it("every operation is named", () => {
    expect(unnamedOperations).toEqual([]);
  });

  it.each(operations.map((op) => [op.id, op] as const))(
    "%s is valid against the schema",
    (_id, op) => {
      expect(validate(schema, op.doc).map((e) => e.message)).toEqual([]);
    },
  );
});

describe("the branding selection and the branding type share one vocabulary", () => {
  const selection = /branding \{([\s\S]*?)\}/.exec(SITE_CONFIG_QUERY)?.[1] ?? "";
  const selected = selection
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();

  it("selects exactly the fields the published vocabulary names", () => {
    expect(
      selected,
      "`CmssyBranding` is `Record<BrandingFieldName, string | null>`, derived from `brandingFieldNames` - so the type grows on its own the moment @cmssy/types publishes a new branding field, while a hand-written selection set does not. A consumer would then read a field the type promises, get `undefined` rather than the `null` the type allows, and a `!== null` guard would let it through into an attribute. Validation against the SDL cannot catch this: a field that is merely NOT selected is a perfectly valid query.",
    ).toEqual([...brandingFieldNames].sort());
  });

  it("knows the vocabulary it compared against is not empty", () => {
    expect(
      brandingFieldNames.length,
      "The check above compares two derived lists. If the vocabulary were ever empty both sides would be `[]` and it would pass having asserted nothing.",
    ).toBeGreaterThanOrEqual(5);
  });
});

const program = (() => {
  const configPath = resolve(here, "../../tsconfig.json");
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    dirname(configPath),
  );
  return ts.createProgram(parsed.fileNames, parsed.options);
})();
const checker = program.getTypeChecker();

function withoutNullish(type: ts.Type): ts.Type[] {
  return (type.isUnion() ? type.types : [type]).filter(
    (member) =>
      (member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) === 0,
  );
}

function acceptsNullish(type: ts.Type): boolean {
  return (type.isUnion() ? type.types : [type]).some(
    (member) =>
      (member.flags &
        (ts.TypeFlags.Null |
          ts.TypeFlags.Undefined |
          ts.TypeFlags.Any |
          ts.TypeFlags.Unknown)) !==
      0,
  );
}

const anyLocation = program.getSourceFiles()[0]!;

function typeOfProperty(property: ts.Symbol): ts.Type {
  return checker.getTypeOfSymbolAtLocation(
    property,
    property.valueDeclaration ?? anyLocation,
  );
}

function variablesTypeOf(declaration: ts.VariableDeclaration): ts.Type | null {
  const operation = checker.getTypeAtLocation(declaration.name);
  const apiType = operation.getProperty("__apiType");
  if (!apiType) return null;
  const signature = withoutNullish(
    checker.getTypeOfSymbolAtLocation(apiType, declaration.name),
  ).flatMap((member) => member.getCallSignatures())[0];
  const variables = signature?.getParameters()[0];
  if (!variables) return null;
  return checker.getTypeOfSymbolAtLocation(variables, declaration.name);
}

interface TypedOperationDeclaration {
  file: string;
  name: string;
  variables: ts.Type;
  text: string | null;
}

function literalText(declaration: ts.VariableDeclaration): string | null {
  const initializer = declaration.initializer;
  if (!initializer || !ts.isCallExpression(initializer)) return null;
  const argument = initializer.arguments[0];
  if (!argument) return null;
  return ts.isNoSubstitutionTemplateLiteral(argument) ||
    ts.isStringLiteral(argument)
    ? argument.text
    : null;
}

const typedDeclarations = new Map<string, TypedOperationDeclaration>();
const duplicateDeclarations: string[] = [];
const pinnedCalls: { where: string; names: string[] }[] = [];

function documentNames(node: ts.Expression): string[] {
  if (ts.isParenthesizedExpression(node)) return documentNames(node.expression);
  if (ts.isConditionalExpression(node)) {
    return [
      ...documentNames(node.whenTrue),
      ...documentNames(node.whenFalse),
    ];
  }
  if (ts.isIdentifier(node)) return [node.text];
  if (ts.isPropertyAccessExpression(node)) return [node.name.text];
  return [];
}

function isExpectedToFail(node: ts.Node): boolean {
  const file = node.getSourceFile();
  return (ts.getLeadingCommentRanges(file.text, node.getFullStart()) ?? []).some(
    (range) =>
      file.text.slice(range.pos, range.end).includes("@ts-expect-error"),
  );
}

function positionOf(node: ts.Node): string {
  const file = node.getSourceFile();
  const { line } = file.getLineAndCharacterOfPosition(node.getStart());
  return `${file.fileName}:${line + 1}`;
}

for (const file of program.getSourceFiles()) {
  if (file.isDeclarationFile) continue;
  if (!file.fileName.includes("/src/")) continue;
  const real = realpathSync(file.fileName);
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      ts.isSourceFile(node.parent.parent.parent)
    ) {
      const variables = variablesTypeOf(node);
      if (variables) {
        if (typedDeclarations.has(node.name.text)) {
          duplicateDeclarations.push(`${positionOf(node)}: ${node.name.text}`);
        } else {
          typedDeclarations.set(node.name.text, {
            file: real,
            name: node.name.text,
            variables,
            text: literalText(node),
          });
        }
      }
    }
    if (
      (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
      node.typeArguments &&
      node.typeArguments.length > 0
    ) {
      if (!isExpectedToFail(node)) {
        for (const argument of node.arguments ?? []) {
          const names = documentNames(argument);
          if (names.length > 0) {
            pinnedCalls.push({ where: positionOf(node), names });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(file, visit);
}

function scalarAccepts(name: string, member: ts.Type): boolean {
  const flags = member.flags;
  switch (name) {
    case "String":
    case "ID":
      return (flags & ts.TypeFlags.StringLike) !== 0;
    case "Int":
    case "Float":
      return (flags & ts.TypeFlags.NumberLike) !== 0;
    case "Boolean":
      return (flags & ts.TypeFlags.BooleanLike) !== 0;
    default:
      return true;
  }
}

function gradeValue(
  gqlType: GraphQLInputType,
  tsType: ts.Type,
  where: string,
  problems: string[],
  seen: Set<string>,
): void {
  if (isNonNullType(gqlType)) {
    if (acceptsNullish(tsType)) {
      problems.push(
        `${where}: the SDL says ${String(gqlType)}, the TypeScript type accepts null or undefined`,
      );
    }
    gradeValue(gqlType.ofType, tsType, where, problems, seen);
    return;
  }

  const members = withoutNullish(tsType);
  if (members.length === 0) return;

  if (isListType(gqlType)) {
    for (const member of members) {
      if (!checker.isArrayType(member)) {
        problems.push(
          `${where}: the SDL says ${String(gqlType)}, the TypeScript type is ${checker.typeToString(member)}`,
        );
        continue;
      }
      const element = checker.getTypeArguments(member as ts.TypeReference)[0];
      if (element) {
        gradeValue(gqlType.ofType, element, `${where}[]`, problems, seen);
      }
    }
    return;
  }

  if (isInputObjectType(gqlType)) {
    if (seen.has(gqlType.name)) return;
    const nested = new Set(seen).add(gqlType.name);
    const fields = gqlType.getFields();
    for (const member of members) {
      const declared = new Map(
        checker
          .getPropertiesOfType(member)
          .map((property) => [property.name, property] as const),
      );
      for (const extra of declared.keys()) {
        if (!(extra in fields)) {
          problems.push(
            `${where}.${extra}: the TypeScript type declares it, input ${gqlType.name} in the SDL does not`,
          );
        }
      }
      for (const [fieldName, field] of Object.entries(fields)) {
        const property = declared.get(fieldName);
        if (!property) {
          if (isNonNullType(field.type) && field.defaultValue === undefined) {
            problems.push(
              `${where}.${fieldName}: input ${gqlType.name} in the SDL requires it (${String(field.type)}), the TypeScript type cannot carry it`,
            );
          }
          continue;
        }
        gradeValue(
          field.type,
          typeOfProperty(property),
          `${where}.${fieldName}`,
          problems,
          nested,
        );
      }
    }
    return;
  }

  if (isScalarType(gqlType)) {
    for (const member of members) {
      if (!scalarAccepts(gqlType.name, member)) {
        problems.push(
          `${where}: the SDL says ${gqlType.name}, the TypeScript type is ${checker.typeToString(member)}`,
        );
      }
    }
    return;
  }

  if (isEnumType(gqlType)) {
    for (const member of members) {
      if ((member.flags & ts.TypeFlags.StringLike) === 0) {
        problems.push(
          `${where}: the SDL says enum ${gqlType.name}, the TypeScript type is ${checker.typeToString(member)}`,
        );
      }
    }
  }
}

function gradeOperation(
  doc: DocumentNode,
  variablesType: ts.Type,
): string[] {
  const problems: string[] = [];
  const declared = new Map(
    checker
      .getPropertiesOfType(variablesType)
      .map((property) => [property.name, property] as const),
  );
  const definitions = doc.definitions.filter(
    (definition): definition is OperationDefinitionNode =>
      definition.kind === Kind.OPERATION_DEFINITION,
  );
  const wired = new Set<string>();

  for (const definition of definitions) {
    for (const variable of definition.variableDefinitions ?? []) {
      const name = variable.variable.name.value;
      wired.add(name);
      const property = declared.get(name);
      if (!property) {
        problems.push(
          `$${name}: the operation declares it, the Variables type does not`,
        );
        continue;
      }
      const gqlType = typeFromAST(schema, variable.type);
      if (!gqlType || !isInputType(gqlType)) continue;
      const effective =
        isNonNullType(gqlType) && variable.defaultValue !== undefined
          ? gqlType.ofType
          : gqlType;
      gradeValue(
        effective,
        typeOfProperty(property),
        `$${name}`,
        problems,
        new Set(),
      );
    }
  }

  for (const name of declared.keys()) {
    if (!wired.has(name)) {
      problems.push(
        `${name}: the Variables type declares it, no operation in the document takes a variable by that name`,
      );
    }
  }

  return problems;
}

function documentOf(declaration: TypedOperationDeclaration): DocumentNode | null {
  const discovered = operations.find((op) =>
    op.id.endsWith(`:${declaration.name}`),
  );
  if (discovered) return discovered.doc;
  if (!declaration.text) return null;
  try {
    return parse(declaration.text);
  } catch {
    return null;
  }
}

const graded = [...typedDeclarations.values()].flatMap((declaration) => {
  const doc = documentOf(declaration);
  return doc
    ? [{ id: `${declaration.file}:${declaration.name}`, doc, declaration }]
    : [];
});

describe("every SDK operation declares the variables it sends", () => {
  it("leaves no operation untyped", () => {
    expect(
      operations
        .filter(
          (op) => !typedDeclarations.has(op.id.split(":")[1] ?? ""),
        )
        .map((op) => op.id),
      "An operation reaching the delivery API through a plain template string takes `Record<string, unknown>`: a renamed or missing variable is then a 400 from production, not a build error. Wrap it with `typedOperation<Result, Variables>` so the compiler grades the call.",
    ).toEqual([]);
  });

  it("grades at least as many operations as the package ships", () => {
    expect(
      new Set(graded.map((entry) => entry.declaration.name)).size,
      "If discovery broke, every per-operation assertion below would iterate an empty list and pass having compared nothing.",
    ).toBeGreaterThanOrEqual(14);
  });

  it("grades a program that compiled", () => {
    expect(
      program
        .getSemanticDiagnostics()
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
        ),
      "Every assertion here reads types out of this program. If an import did not resolve - an unbuilt `@cmssy/types`, a moved file - the checker hands back error types, nothing matches anything, and the grader reports no problems because it understood nothing.",
    ).toEqual([]);
  });

  it("resolves a known operation's variables to real property names", () => {
    const form = typedDeclarations.get("FORM_QUERY");
    expect(
      checker
        .getPropertiesOfType(form!.variables)
        .map((property) => property.name)
        .sort(),
      "A positive control: the grader compares two derived lists, and an error type has no properties, so a degraded program would make every comparison pass on two empty sets.",
    ).toEqual(["formId"]);
  });

  it("matches each operation to one declaration", () => {
    expect(
      duplicateDeclarations,
      "Operations are matched to their `Variables` type by constant name - module scope only, so a local fixture inside a test is not one. Two module-level declarations sharing a name would silently grade one document against the other's type.",
    ).toEqual([]);
  });

  it.each(graded.map((entry) => [entry.id, entry] as const))(
    "%s declares exactly the variables its document sends",
    (_id, entry) => {
      expect(
        gradeOperation(entry.doc, entry.declaration.variables),
        "The `Variables` type beside the operation is hand-written: nothing but this check ties it to the operation text and to the SDL, so a renamed variable or a widened input field would otherwise reach production unnoticed.",
      ).toEqual([]);
    },
  );

  it("never pins a result type over a typed operation", () => {
    expect(
      pinnedCalls
        .filter((call) =>
          call.names.some((name) => typedDeclarations.has(name)),
        )
        .map(
          (call) =>
            `${call.where}: ${call.names.filter((name) => typedDeclarations.has(name)).join(", ")}`,
        ),
      "An explicit type argument at the call site wins over the type the document carries - that is how `queryScoped<{...}>(FORM_QUERY, ...)` sent unchecked variables while looking typed. Matching by name, not by type, so a ternary between two documents is caught too: its type is a union, and asking a union for `__apiType` silently answered no.",
    ).toEqual([]);
  });
});
