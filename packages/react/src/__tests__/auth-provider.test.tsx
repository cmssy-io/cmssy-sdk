// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, act, cleanup } from "@testing-library/react";
import {
  CmssyAuthProvider,
  useCmssyUser,
  type CmssyAuthState,
} from "../auth/auth-provider";

function capture(): { current: CmssyAuthState | null } {
  const ref: { current: CmssyAuthState | null } = { current: null };
  function Probe() {
    ref.current = useCmssyUser();
    const { user, loading } = ref.current;
    return (
      <div data-testid="state">
        {loading ? "loading" : user ? user.email : "anon"}
      </div>
    );
  }
  render(
    <CmssyAuthProvider>
      <Probe />
    </CmssyAuthProvider>,
  );
  return ref;
}

const calls: Array<{ url: string; init?: RequestInit }> = [];

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(handler(url, init)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

beforeEach(() => {
  calls.length = 0;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CmssyAuthProvider / useCmssyUser", () => {
  it("loads the user from /me on mount (same-origin, no token in the request)", async () => {
    mockFetch((url) =>
      url.endsWith("/me") ? { user: { recordId: "r1", email: "u@x.com" } } : {},
    );
    capture();
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("u@x.com"),
    );
    const me = calls.find((c) => c.url.endsWith("/api/cmssy/auth/me"));
    expect(me?.init?.credentials).toBe("same-origin");
  });

  it("renders anon when /me returns no user", async () => {
    mockFetch(() => ({ user: null }));
    capture();
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("anon"),
    );
  });

  it("signIn sets the user from the response", async () => {
    mockFetch((url) => {
      if (url.endsWith("/me")) return { user: null };
      if (url.endsWith("/sign-in"))
        return { ok: true, user: { recordId: "r1", email: "in@x.com" } };
      return {};
    });
    const ref = capture();
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("anon"),
    );
    let result: { ok: boolean } | undefined;
    await act(async () => {
      result = await ref.current!.signIn("in@x.com", "Password123");
    });
    expect(result?.ok).toBe(true);
    expect(screen.getByTestId("state").textContent).toBe("in@x.com");
  });

  it("signIn leaves the user null on failure", async () => {
    mockFetch((url) => {
      if (url.endsWith("/me")) return { user: null };
      return { ok: false, message: "Invalid credentials." };
    });
    const ref = capture();
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("anon"),
    );
    let result: { ok: boolean; message?: string } | undefined;
    await act(async () => {
      result = await ref.current!.signIn("x@x.com", "bad");
    });
    expect(result?.ok).toBe(false);
    expect(result?.message).toBe("Invalid credentials.");
    expect(screen.getByTestId("state").textContent).toBe("anon");
  });

  it("signOut clears the user", async () => {
    mockFetch((url) =>
      url.endsWith("/me")
        ? { user: { recordId: "r1", email: "u@x.com" } }
        : { ok: true },
    );
    const ref = capture();
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("u@x.com"),
    );
    await act(async () => {
      await ref.current!.signOut();
    });
    expect(screen.getByTestId("state").textContent).toBe("anon");
    expect(calls.some((c) => c.url.endsWith("/sign-out"))).toBe(true);
  });

  it("register relays the result without setting the user, POSTing JSON", async () => {
    mockFetch((url) => {
      if (url.endsWith("/me")) return { user: null };
      return { ok: true, message: "Check your email." };
    });
    const ref = capture();
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("anon"),
    );
    let result: { ok: boolean; message?: string } | undefined;
    await act(async () => {
      result = await ref.current!.register("n@x.com", "Password123", {
        name: "N",
      });
    });
    expect(result).toEqual({ ok: true, message: "Check your email." });
    expect(screen.getByTestId("state").textContent).toBe("anon");
    const call = calls.find((c) => c.url.endsWith("/register"));
    expect(call?.init?.method).toBe("POST");
    expect(
      (call?.init?.headers as Record<string, string>)["content-type"],
    ).toBe("application/json");
  });

  it("refresh re-reads /me", async () => {
    let me: { user: { recordId: string; email: string } | null } = {
      user: null,
    };
    mockFetch((url) => (url.endsWith("/me") ? me : {}));
    const ref = capture();
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("anon"),
    );
    me = { user: { recordId: "r1", email: "back@x.com" } };
    await act(async () => {
      await ref.current!.refresh();
    });
    expect(screen.getByTestId("state").textContent).toBe("back@x.com");
  });

  it("signOut clears the user even if the network call fails", async () => {
    let first = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/me")) {
          return new Response(
            JSON.stringify({ user: { recordId: "r1", email: "u@x.com" } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (first) {
          first = false;
          throw new Error("network down");
        }
        return new Response("{}", { status: 200 });
      }),
    );
    const ref = capture();
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("u@x.com"),
    );
    await act(async () => {
      await ref.current!.signOut().catch(() => undefined);
    });
    expect(screen.getByTestId("state").textContent).toBe("anon");
  });

  it("useCmssyUser throws outside the provider", () => {
    function Bare() {
      useCmssyUser();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/CmssyAuthProvider/);
    spy.mockRestore();
  });
});
