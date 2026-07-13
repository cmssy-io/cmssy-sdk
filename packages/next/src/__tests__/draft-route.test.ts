import { beforeEach, describe, expect, it, vi } from "vitest";

const { enable, disable, redirect } = vi.hoisted(() => ({
  enable: vi.fn(),
  disable: vi.fn(),
  redirect: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
}));

vi.mock("next/headers", () => ({
  draftMode: vi.fn(async () => ({ enable, disable, isEnabled: false })),
}));

vi.mock("next/navigation", () => ({ redirect }));

import { createDraftRoute } from "../create-draft-route";

const SECRET = "s3cret-value-1234";

describe("createDraftRoute", () => {
  beforeEach(() => {
    enable.mockClear();
    disable.mockClear();
    redirect.mockClear();
  });

  it("returns 500 at request time when the configured secret is too short", async () => {
    const GET = createDraftRoute({ draftSecret: "short" });
    const res = await GET(
      new Request("https://pilot.test/api/draft?secret=short"),
    );
    expect(res.status).toBe(500);
    expect(enable).not.toHaveBeenCalled();
  });

  it("throws when defaultRedirect is an absolute URL", () => {
    expect(() =>
      createDraftRoute({
        draftSecret: SECRET,
        defaultRedirect: "https://evil.test",
      }),
    ).toThrow(/same-origin path/);
  });

  it("throws when defaultRedirect is protocol-relative", () => {
    expect(() =>
      createDraftRoute({ draftSecret: SECRET, defaultRedirect: "//evil.test" }),
    ).toThrow(/same-origin path/);
  });

  it("rejects a missing secret with 401", async () => {
    const GET = createDraftRoute({ draftSecret: SECRET });
    const res = await GET(new Request("https://pilot.test/api/draft"));
    expect(res.status).toBe(401);
    expect(enable).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret with 401", async () => {
    const GET = createDraftRoute({ draftSecret: SECRET });
    const res = await GET(
      new Request("https://pilot.test/api/draft?secret=wrong-but-long-enough"),
    );
    expect(res.status).toBe(401);
    expect(enable).not.toHaveBeenCalled();
  });

  it("enables draft mode and redirects on a valid secret", async () => {
    const GET = createDraftRoute({ draftSecret: SECRET });
    await expect(
      GET(
        new Request(
          `https://pilot.test/api/draft?secret=${SECRET}&redirect=/about`,
        ),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/about");
    expect(enable).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith("/about");
  });

  it("falls back to '/' for a protocol-relative open redirect", async () => {
    const GET = createDraftRoute({ draftSecret: SECRET });
    await expect(
      GET(
        new Request(
          `https://pilot.test/api/draft?secret=${SECRET}&redirect=//evil.test`,
        ),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("falls back to '/' for a backslash open redirect", async () => {
    const GET = createDraftRoute({ draftSecret: SECRET });
    await expect(
      GET(
        new Request(
          `https://pilot.test/api/draft?secret=${SECRET}&redirect=/%5Cevil.test`,
        ),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("falls back to '/' for an absolute-url redirect", async () => {
    const GET = createDraftRoute({ draftSecret: SECRET });
    await expect(
      GET(
        new Request(
          `https://pilot.test/api/draft?secret=${SECRET}&redirect=https://evil.test`,
        ),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("uses the configured default redirect", async () => {
    const GET = createDraftRoute({
      draftSecret: SECRET,
      defaultRedirect: "/home",
    });
    await expect(
      GET(new Request(`https://pilot.test/api/draft?secret=${SECRET}`)),
    ).rejects.toThrow("NEXT_REDIRECT:/home");
  });

  it("disables draft mode without a secret and redirects (exit preview)", async () => {
    const GET = createDraftRoute({ draftSecret: SECRET });
    await expect(
      GET(
        new Request("https://pilot.test/api/draft?disable=1&redirect=/blog"),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/blog");
    expect(disable).toHaveBeenCalledOnce();
    expect(enable).not.toHaveBeenCalled();
  });

  it("sanitizes the exit redirect", async () => {
    const GET = createDraftRoute({ draftSecret: SECRET });
    await expect(
      GET(
        new Request(
          "https://pilot.test/api/draft?disable=1&redirect=https://evil.test",
        ),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/");
    expect(disable).toHaveBeenCalledOnce();
  });

  it("exits draft mode even when the configured secret is too short", async () => {
    const GET = createDraftRoute({ draftSecret: "short" });
    await expect(
      GET(new Request("https://pilot.test/api/draft?disable=1")),
    ).rejects.toThrow("NEXT_REDIRECT:/");
    expect(disable).toHaveBeenCalledOnce();
  });
});
