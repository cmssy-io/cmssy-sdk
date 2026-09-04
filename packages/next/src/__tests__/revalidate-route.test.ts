import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidateTag }));

import { createCmssyRevalidateRoute } from "../create-revalidate-route";

const VECTOR = {
  secret: "cmssy-signature-contract-secret",
  timestamp: 1_700_000_000_000,
  body: '{"id":"3f2b9c14-0000-4000-8000-000000000001","event":"content.changed","createdAt":"2023-11-14T22:13:20.000Z","data":{"workspaceId":"695a526b09373a29a6c4a082"}}',
  signature: "6ba056d55c4e9ddc5ab105572f9e11c99501c345dc2a1af41a2d577a81b81993",
} as const;

function delivery(
  body: string = VECTOR.body,
  signature: string = VECTOR.signature,
  timestamp: number = VECTOR.timestamp,
): Request {
  return new Request("https://pilot.test/api/revalidate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cmssy-signature": `t=${timestamp},v1=${signature}`,
    },
    body,
  });
}

describe("createCmssyRevalidateRoute (CMS-952)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: VECTOR.timestamp, toFake: ["Date"] });
    revalidateTag.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers 500 without a secret and expires nothing - a route that cannot verify must not revalidate on anyone's say-so", async () => {
    const POST = createCmssyRevalidateRoute({ secret: undefined });

    const res = await POST(delivery());

    expect(res.status).toBe(500);
    expect(await res.text()).toContain("CMSSY_WEBHOOK_SECRET");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("treats an empty rotation list like no secret", async () => {
    const POST = createCmssyRevalidateRoute({ secret: ["", ""] });

    expect((await POST(delivery())).status).toBe(500);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("expires the content tag for the delivery cmssy signed", async () => {
    const POST = createCmssyRevalidateRoute({ secret: VECTOR.secret });

    const res = await POST(delivery());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revalidated: ["cmssy-content"] });
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith("cmssy-content", { expire: 0 });
  });

  it("expires the consumer's own tags after the content tag, each once", async () => {
    const POST = createCmssyRevalidateRoute({
      secret: VECTOR.secret,
      tags: ["shop", "cmssy-content", "shop"],
    });

    const res = await POST(delivery());

    expect(await res.json()).toEqual({
      revalidated: ["cmssy-content", "shop"],
    });
    expect(revalidateTag.mock.calls).toEqual([
      ["cmssy-content", { expire: 0 }],
      ["shop", { expire: 0 }],
    ]);
  });

  it("verifies against every secret of a rotation", async () => {
    const POST = createCmssyRevalidateRoute({
      secret: ["retired-secret-value", VECTOR.secret],
    });

    expect((await POST(delivery())).status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledTimes(1);
  });

  it("answers 401 and expires nothing when the body does not match the signature", async () => {
    const POST = createCmssyRevalidateRoute({ secret: VECTOR.secret });
    const tampered = VECTOR.body.replace("content.changed", "content.chan9ed");

    const res = await POST(delivery(tampered));

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Webhook signature mismatch");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("answers 401 without a signature header", async () => {
    const POST = createCmssyRevalidateRoute({ secret: VECTOR.secret });

    const res = await POST(
      new Request("https://pilot.test/api/revalidate", {
        method: "POST",
        body: VECTOR.body,
      }),
    );

    expect(res.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("answers 401 for a replayed delivery outside the tolerance window", async () => {
    vi.setSystemTime(VECTOR.timestamp + 6 * 60 * 1000);
    const POST = createCmssyRevalidateRoute({ secret: VECTOR.secret });

    const res = await POST(delivery());

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Webhook timestamp outside tolerance");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("lets the caller widen the tolerance the way verifyCmssyWebhook does", async () => {
    vi.setSystemTime(VECTOR.timestamp + 6 * 60 * 1000);
    const POST = createCmssyRevalidateRoute({
      secret: VECTOR.secret,
      toleranceSeconds: 10 * 60,
    });

    expect((await POST(delivery())).status).toBe(200);
  });
});
