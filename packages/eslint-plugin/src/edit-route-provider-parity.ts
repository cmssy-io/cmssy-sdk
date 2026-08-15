import { readFileSync } from "node:fs";
import { sep } from "node:path";
import type { Rule } from "eslint";

const LAYOUT = /\/layout\.(tsx|jsx|js|ts)$/;

const EDIT_SEGMENT = "cmssy-edit";

const WRAPPERS = new Set([
  "LazyMotion",
  "MotionConfig",
  "AnimatePresence",
  "MotionProvider",
]);

function normalize(path: string): string {
  return path.split(sep).join("/");
}

function isWrapper(name: string): boolean {
  return name.endsWith("Provider") || WRAPPERS.has(name);
}

function elementName(node: unknown): string | null {
  const opening = (node as { openingElement?: { name?: unknown } })
    .openingElement;
  const name = (opening?.name ?? {}) as { type?: string; name?: string };
  return name.type === "JSXIdentifier" ? (name.name ?? null) : null;
}

function editCounterpart(filename: string): string | null {
  const file = normalize(filename);
  if (!LAYOUT.test(file)) return null;

  const app = file.lastIndexOf("/app/");
  if (app === -1) return null;
  const rest = file.slice(app + "/app/".length);
  if (!rest.includes("/")) return null;
  if (rest.startsWith(`${EDIT_SEGMENT}/`)) return null;

  return `${file.slice(0, app)}/app/${EDIT_SEGMENT}/${rest}`;
}

function rendersElement(code: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<${escaped}[\\s/>]`).test(code);
}

function isChildrenSlot(node: unknown): boolean {
  const container = node as {
    type?: string;
    expression?: { type?: string; name?: string };
  };
  return (
    container.type === "JSXExpressionContainer" &&
    container.expression?.type === "Identifier" &&
    container.expression.name === "children"
  );
}

function wrapsChildren(node: unknown): boolean {
  const children = (node as { children?: unknown[] }).children ?? [];
  return children.some(
    (child) => isChildrenSlot(child) || wrapsChildren(child),
  );
}

export const editRouteProviderParity: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a provider that wraps the public route's children to wrap the cmssy edit route's children too",
    },
    schema: [],
    messages: {
      missingProvider:
        "<{{name}}> wraps the blocks on the public route but not on {{editRoute}}, so the editor renders them without whatever it provides. A missing animation provider is the loudest case - the reveals never attach and the preview stays blank - but any context the blocks read is gone the same way.\nEither hoist <{{name}}> to app/layout.tsx, the root both routes share, or render it in the edit layout too.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const counterpart = editCounterpart(filename);
    if (!counterpart) return {};

    let editCode: string;
    try {
      editCode = readFileSync(counterpart, "utf8");
    } catch {
      return {};
    }

    const editRoute = counterpart.slice(counterpart.lastIndexOf("/app/") + 1);
    const reported = new Set<string>();

    return {
      JSXElement(node: Rule.Node) {
        const name = elementName(node);
        if (!name || reported.has(name)) return;
        if (!isWrapper(name)) return;
        if (!wrapsChildren(node)) return;
        if (rendersElement(editCode, name)) return;

        reported.add(name);
        context.report({
          node,
          messageId: "missingProvider",
          data: { name, editRoute },
        });
      },
    };
  },
};
