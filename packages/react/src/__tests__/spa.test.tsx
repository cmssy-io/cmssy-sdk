// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { fields } from "@cmssy/core";
import { CmssyRoute } from "../spa";
import { defineBlock, type BlockProps } from "../registry";

const loadCmssyRoute = vi.hoisted(() => vi.fn());
vi.mock("../components/load-cmssy-route", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return { ...actual, loadCmssyRoute };
});

const heroProps = { heading: fields.text() };
const Hero = ({ content }: BlockProps<typeof heroProps>) => (
  <h1>{content.heading ?? ""}</h1>
);
const blocks = [
  defineBlock({
    type: "hero",
    label: "Hero",
    component: Hero,
    props: heroProps,
  }),
];

const CONFIG = {
  apiUrl: "https://api.cmssy.io/graphql",
  org: "acme",
  workspaceSlug: "shop",
} as Parameters<typeof CmssyRoute>[0]["config"];

function route(overrides: Record<string, unknown> = {}) {
  return {
    page: {
      id: "p1",
      slug: "/",
      blocks: [{ id: "b1", type: "hero", content: { en: { heading: "Hi" } } }],
    },
    layouts: [
      {
        region: "header",
        blocks: [
          {
            id: "h1",
            type: "hero",
            order: 0,
            isActive: true,
            content: { en: { heading: "Top" } },
          },
        ],
      },
    ],
    pageContext: { slug: "/", path: [] },
    locale: "en",
    defaultLocale: "en",
    enabledLocales: ["en"],
    path: [],
    blockData: {},
    blockContent: {},
    layoutData: {},
    regions: ["header"],
    ...overrides,
  };
}

function renderRoute(props: Record<string, unknown> = {}) {
  return render(
    <CmssyRoute
      config={CONFIG}
      blocks={blocks}
      fallback={<p>loading</p>}
      notFound={<p>not found</p>}
      renderError={(error) => <p>failed: {error.message}</p>}
      {...props}
    >
      {({ Region, Blocks }) => (
        <>
          <Region id="header" />
          <main>
            <Blocks />
          </main>
        </>
      )}
    </CmssyRoute>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CmssyRoute (CMS-1874)", () => {
  it("shows the fallback while the route is still loading", () => {
    loadCmssyRoute.mockReturnValue(new Promise(() => {}));
    renderRoute();

    expect(screen.getByText("loading")).toBeDefined();
    expect(screen.queryByText("Hi")).toBeNull();
  });

  it("renders the region and the page once the route answers", async () => {
    loadCmssyRoute.mockResolvedValue(route());
    renderRoute();

    await waitFor(() => expect(screen.getByText("Hi")).toBeDefined());
    expect(screen.getByText("Top")).toBeDefined();
    expect(screen.queryByText("loading")).toBeNull();
  });

  it("keeps the newest route when an older load lands after it", async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    loadCmssyRoute.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    const { rerender } = renderRoute({ path: "/first" });
    await waitFor(() => expect(resolvers).toHaveLength(1));

    rerender(
      <CmssyRoute config={CONFIG} blocks={blocks} path="/second">
        {({ Blocks }) => <Blocks />}
      </CmssyRoute>,
    );
    await waitFor(() => expect(resolvers).toHaveLength(2));

    resolvers[1]!(
      route({
        page: {
          id: "p2",
          slug: "/second",
          blocks: [
            { id: "b2", type: "hero", content: { en: { heading: "Second" } } },
          ],
        },
      }),
    );
    resolvers[0]!(
      route({
        page: {
          id: "p1",
          slug: "/first",
          blocks: [
            { id: "b1", type: "hero", content: { en: { heading: "First" } } },
          ],
        },
      }),
    );

    await waitFor(() => expect(screen.getByText("Second")).toBeDefined());
    expect(screen.queryByText("First")).toBeNull();
  });

  it("renders the not-found slot when the workspace has no such page", async () => {
    loadCmssyRoute.mockResolvedValue(route({ page: null }));
    renderRoute();

    await waitFor(() => expect(screen.getByText("not found")).toBeDefined());
  });

  it("hands a failed load to the caller instead of throwing", async () => {
    loadCmssyRoute.mockRejectedValue(new Error("offline"));
    renderRoute();

    await waitFor(() =>
      expect(screen.getByText(/failed: offline/)).toBeDefined(),
    );
  });

  it("asks for the path it was given, and reloads when the path changes", async () => {
    loadCmssyRoute.mockResolvedValue(route());
    const { rerender } = renderRoute({ path: "/pricing" });

    await waitFor(() => expect(loadCmssyRoute).toHaveBeenCalled());
    expect(loadCmssyRoute.mock.calls[0]?.[1]?.path).toStrictEqual(["pricing"]);

    rerender(
      <CmssyRoute config={CONFIG} blocks={blocks} path="/about">
        {({ Blocks }) => <Blocks />}
      </CmssyRoute>,
    );

    await waitFor(() => expect(loadCmssyRoute).toHaveBeenCalledTimes(2));
    expect(loadCmssyRoute.mock.calls[1]?.[1]?.path).toStrictEqual(["about"]);
  });
});
