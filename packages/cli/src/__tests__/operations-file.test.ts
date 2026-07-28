import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "graphql";

import { CMSSY_DELIVERY_OPERATIONS } from "@cmssy/core/internal";
import { generateOperationsFile, operationNames } from "../operations-file";
import { runTypes } from "../types-command";

function app(): string {
  return mkdtempSync(join(tmpdir(), "cmssy-ops-"));
}

/** Fails the test if anything reaches the network - operations must not. */
const noFetch = (() => {
  throw new Error("the operations file must not need the network");
}) as unknown as typeof globalThis.fetch;

function deps(cwd: string, lines: string[]) {
  return {
    cwd,
    // No org/workspace: the models half will fail, which is the point - the
    // operations must land anyway.
    env: {} as Record<string, string | undefined>,
    log: (line: string) => lines.push(line),
    fetch: noFetch,
  };
}

describe("generateOperationsFile", () => {
  it("is the SDK's own documents, not a copy of them", () => {
    const file = generateOperationsFile();
    for (const operation of CMSSY_DELIVERY_OPERATIONS) {
      // Byte-for-byte: the moment the CLI starts massaging these, it owns a
      // second version of the shape and can drift from the client that uses it.
      expect(file).toContain(operation.document.trim());
    }
  });

  it("parses as one valid GraphQL document", () => {
    const parsed = parse(generateOperationsFile());
    expect(parsed.definitions).toHaveLength(CMSSY_DELIVERY_OPERATIONS.length);
  });

  it("does not invent PublicPagesByType", () => {
    // Every app's version selects different fields and variables, and the SDK
    // has no canonical one - generating it would mean writing it here.
    expect(operationNames()).not.toContain("PublicPagesByType");
  });
});

describe("cmssy types, operations half", () => {
  it("writes them with no workspace and no network", async () => {
    const cwd = app();
    const lines: string[] = [];

    await runTypes({}, deps(cwd, lines));

    const written = readFileSync(join(cwd, "cmssy/operations.graphql"), "utf8");
    expect(written).toBe(generateOperationsFile());
    expect(lines.join("\n")).toContain("7 operations");
  });

  it("rewrites an edited file instead of protecting it", async () => {
    const cwd = app();
    mkdirSync(join(cwd, "cmssy"), { recursive: true });
    writeFileSync(join(cwd, "cmssy/operations.graphql"), "query Mine { x }\n");

    await runTypes({}, deps(cwd, []));

    // Vendored, not owned. Two documents cannot share an operation name under
    // the codegen client preset anyway, so "edit the generated one" was never
    // a workflow - a divergent app writes its own query, under its own name.
    expect(readFileSync(join(cwd, "cmssy/operations.graphql"), "utf8")).toBe(
      generateOperationsFile(),
    );
  });

  it("--check fails on a missing file", async () => {
    const cwd = app();
    const lines: string[] = [];

    const code = await runTypes({ check: true }, deps(cwd, lines));

    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/operations\.graphql is missing/);
  });

  it("--check fails on a stale file", async () => {
    const cwd = app();
    mkdirSync(join(cwd, "cmssy"), { recursive: true });
    writeFileSync(
      join(cwd, "cmssy/operations.graphql"),
      generateOperationsFile().replace("PublicSiteConfig", "PublicSiteConfigOld"),
    );
    const lines: string[] = [];

    const code = await runTypes({ check: true }, deps(cwd, lines));

    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/out of date/);
  });

  it("--no-operations leaves the app alone", async () => {
    const cwd = app();

    await runTypes({ noOperations: true }, deps(cwd, []));

    expect(() =>
      readFileSync(join(cwd, "cmssy/operations.graphql"), "utf8"),
    ).toThrow();
  });

  it("honours --operations-out", async () => {
    const cwd = app();

    await runTypes({ operationsOut: "graphql/cmssy.graphql" }, deps(cwd, []));

    expect(readFileSync(join(cwd, "graphql/cmssy.graphql"), "utf8")).toBe(
      generateOperationsFile(),
    );
  });
});
