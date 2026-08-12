// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { collectFormIds } from "@cmssy/core/internal";
import { CmssyServerPage } from "../components/cmssy-server-page";
import { defineBlock, type BlockProps } from "../registry";
import { fields } from "@cmssy/core";
import type { RawBlock } from "@cmssy/core";
import type { CmssyBlockContext } from "@cmssy/core";

const formSchemas = {
  contact: { formId: fields.form() },
  hero: { heading: fields.text() },
};

describe("collectFormIds", () => {
  it("collects unique form ids from block content", () => {
    const blocks: RawBlock[] = [
      { id: "a", type: "contact", content: { en: { formId: "f1" } } },
      { id: "b", type: "hero", content: { en: { heading: "Hi" } } },
      { id: "c", type: "contact", content: { en: { formId: "f1" } } },
      { id: "d", type: "contact", content: { en: { formId: "f2" } } },
    ];
    expect(collectFormIds(blocks, formSchemas, "en", "en").sort()).toEqual([
      "f1",
      "f2",
    ]);
  });

  it("ignores empty or non-string form values", () => {
    const blocks: RawBlock[] = [
      { id: "a", type: "contact", content: { en: { formId: "" } } },
      { id: "b", type: "contact", content: { en: { formId: 123 } } },
      { id: "c", type: "hero", content: { en: {} } },
    ];
    expect(collectFormIds(blocks, formSchemas, "en", "en")).toEqual([]);
  });

  it("finds a form field under any key, not just formId", () => {
    const blocks: RawBlock[] = [
      { id: "a", type: "contact", content: { en: { enquiryForm: "f9" } } },
    ];
    const schemas = { contact: { enquiryForm: fields.form() } };
    expect(collectFormIds(blocks, schemas, "en", "en")).toEqual(["f9"]);
  });

  it("reads a form field the editor wrote into the advanced bucket", () => {
    const blocks: RawBlock[] = [
      {
        id: "a",
        type: "contact",
        content: { en: {} },
        advanced: { formId: "f4" },
      },
    ];
    const schemas = { contact: { formId: fields.form({ tab: "advanced" }) } };
    expect(collectFormIds(blocks, schemas, "en", "en")).toEqual(["f4"]);
  });

  it("ignores a value under a key the schema does not declare as a form", () => {
    const blocks: RawBlock[] = [
      { id: "a", type: "contact", content: { en: { formId: "f1" } } },
    ];
    const schemas = { contact: { formId: fields.text() } };
    expect(collectFormIds(blocks, schemas, "en", "en")).toEqual([]);
  });
});

const contactProps = { formId: fields.form() };

function Contact({ content, context }: BlockProps<typeof contactProps>) {
  const id = content.formId ?? "";
  return <div>{context?.forms?.[id]?.name ?? "no-form"}</div>;
}

const blocks = [
  defineBlock({ type: "contact", component: Contact, props: contactProps }),
];

const page = {
  id: "p",
  blocks: [{ id: "b", type: "contact", content: { en: { formId: "f1" } } }],
};

describe("CmssyServerPage forms injection", () => {
  it("exposes injected forms to blocks via context.forms", async () => {
    const { container } = render(
      await CmssyServerPage({
        page,
        blocks,
        locale: "en",
        defaultLocale: "en",
        forms: {
          f1: {
            id: "f1",
            name: "Contact form",
            slug: null,
            description: null,
            fields: [],
            settings: null,
          },
        },
      }),
    );
    expect(container.textContent).toContain("Contact form");
  });

  it("renders without forms (backward compatible)", async () => {
    const { container } = render(
      await CmssyServerPage({
        page,
        blocks,
        locale: "en",
        defaultLocale: "en",
      }),
    );
    expect(container.textContent).toContain("no-form");
  });
});
