import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import ts from "typescript";

const FIELDS = resolve(dirname(fileURLToPath(import.meta.url)), "../fields");

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function messagesFor(source: string): string[] {
  dir = mkdtempSync(join(tmpdir(), "cmssy-fields-"));
  const file = join(dir, "block.ts");
  writeFileSync(file, source.replace("<FIELDS>", FIELDS.replace(/\\/g, "/")));
  const program = ts.createProgram([file], {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
  });
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file?.fileName === file.replace(/\\/g, "/"))
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "));
}

describe("the message an unknown field option produces", () => {
  it("names the field and the key, not `never` (CMS-1805)", () => {
    const messages = messagesFor(`
      import { fields } from "<FIELDS>";
      export const props = {
        count: fields.number({ label: "Count", test: false }),
      };
    `);

    expect(messages.join("\n")).toContain(
      `Type 'false' is not assignable to type '"fields.number has no option: test"'`,
    );
  });

  it("names the field the option was written on, not a generic one", () => {
    const messages = messagesFor(`
      import { fields } from "<FIELDS>";
      export const props = {
        logo: fields.media({ label: "Logo", maxItms: 3 }),
      };
    `);

    expect(messages.join("\n")).toContain(
      "fields.media has no option: maxItms",
    );
  });

  it("says nothing about options the field does accept", () => {
    const messages = messagesFor(`
      import { fields } from "<FIELDS>";
      export const props = {
        count: fields.number({ label: "Count", required: true }),
        logo: fields.media({ label: "Logo", aspectRatio: "16:9" }),
      };
    `);

    expect(messages).toEqual([]);
  });
});
