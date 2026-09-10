// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { useBlockLoaderData } from "../bridge/use-block-loader-data";

const DEBOUNCE_MS = 300;

let fetchMock: ReturnType<typeof vi.fn>;

function ok(data: Record<string, unknown>) {
  return { ok: true, status: 200, json: async () => ({ data }) };
}

function Probe({
  blocks,
  seen,
  url,
}: {
  blocks: Array<{ id: string; type: string; content: Record<string, unknown> }>;
  seen: (data: Record<string, unknown>) => void;
  url?: string;
}) {
  const data = useBlockLoaderData({
    enabled: blocks.length > 0,
    blocks,
    locale: "en",
    defaultLocale: "en",
    ...(url ? { url } : {}),
  });
  seen(data);
  return null;
}

const grid = [{ id: "b1", type: "product-grid", content: { limit: 3 } }];

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn(async () => ok({ b1: { items: ["one"] } }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useBlockLoaderData", () => {
  it("resolves a loader block against the unsaved content", async () => {
    const seen = vi.fn();
    render(<Probe blocks={grid} seen={seen} />);

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body: string }).body,
    );
    expect(body.blocks[0].content).toEqual({ limit: 3 });
    expect(seen).toHaveBeenLastCalledWith({ b1: { items: ["one"] } });
  });

  it("posts once for a burst of keystrokes, with the last content", async () => {
    const { rerender } = render(<Probe blocks={grid} seen={vi.fn()} />);

    for (const limit of [4, 5, 6]) {
      rerender(
        <Probe
          blocks={[{ id: "b1", type: "product-grid", content: { limit } }]}
          seen={vi.fn()}
        />,
      );
      await act(async () => {
        vi.advanceTimersByTime(DEBOUNCE_MS / 3);
      });
    }
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(
      fetchMock,
      "a debounce that fires per keystroke is a loader run per keystroke",
    ).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body: string }).body,
    );
    expect(body.blocks[0].content).toEqual({ limit: 6 });
  });

  it("asks again when the content changes, so a new category means new products", async () => {
    const { rerender } = render(<Probe blocks={grid} seen={vi.fn()} />);
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    rerender(
      <Probe
        blocks={[{ id: "b1", type: "product-grid", content: { limit: 9 } }]}
        seen={vi.fn()}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not ask again when nothing the loader reads has changed", async () => {
    const { rerender } = render(<Probe blocks={grid} seen={vi.fn()} />);
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    rerender(<Probe blocks={[...grid]} seen={vi.fn()} />);
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS * 3);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the data the page was rendered with when the route is not mounted", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    });
    const seen = vi.fn();
    render(<Probe blocks={grid} seen={seen} />);

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(seen).toHaveBeenLastCalledWith({});
    expect(warn.mock.calls[0]?.[0]).toContain("createCmssyBlockDataRoute");
    warn.mockRestore();
  });

  it("stays quiet when the page has no block with a loader", async () => {
    render(<Probe blocks={[]} seen={vi.fn()} />);
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS * 3);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the url the app configured", async () => {
    render(<Probe blocks={grid} seen={vi.fn()} url="/custom/block-data" />);
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/custom/block-data");
  });
});
