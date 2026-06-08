// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { collectFormIds } from "../data/resolve-forms";
import { CmssyServerPage } from "../components/cmssy-server-page";
import { defineBlock } from "../registry";
import { fields } from "../fields";
import type { RawBlock } from "../content/content-client";
import type { CmssyBlockContext } from "../components/block-context";

describe("collectFormIds", () => {
  it("collects unique formId values from block content", () => {
    const blocks: RawBlock[] = [
      { id: "a", type: "contact", content: { en: { formId: "f1" } } },
      { id: "b", type: "hero", content: { en: { heading: "Hi" } } },
      { id: "c", type: "contact", content: { en: { formId: "f1" } } },
      { id: "d", type: "contact", content: { en: { formId: "f2" } } },
    ];
    expect(collectFormIds(blocks, "en", "en").sort()).toEqual(["f1", "f2"]);
  });

  it("ignores empty or non-string formId values", () => {
    const blocks: RawBlock[] = [
      { id: "a", type: "contact", content: { en: { formId: "" } } },
      { id: "b", type: "contact", content: { en: { formId: 123 } } },
      { id: "c", type: "hero", content: { en: {} } },
    ];
    expect(collectFormIds(blocks, "en", "en")).toEqual([]);
  });
});

function Contact({
  content,
  context,
}: {
  content: Record<string, unknown>;
  context?: CmssyBlockContext;
}) {
  const id = content.formId as string;
  return <div>{context?.forms?.[id]?.name ?? "no-form"}</div>;
}

const blocks = [
  defineBlock({
    type: "contact",
    component: Contact,
    props: { formId: fields.singleLine() },
  }),
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
