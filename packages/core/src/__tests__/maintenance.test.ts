import { describe, expect, it } from "vitest";
import type { FetchLike } from "../content/content-client";
import { getMaintenance, maintenanceRefusal } from "../data/maintenance";
import { CmssyGraphqlError } from "../data/http";

const config = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "ws",
};

function answering(payload: unknown): { fetch: FetchLike; urls: string[] } {
  const urls: string[] = [];
  const fetch: FetchLike = async (url) => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => payload };
  };
  return { fetch, urls };
}

describe("getMaintenance", () => {
  it("reads an upcoming freeze from the site's delivery endpoint", async () => {
    const window = {
      startsAt: "2026-11-10T22:00:00.000Z",
      endsAt: "2026-11-11T00:00:00.000Z",
    };
    const { fetch, urls } = answering({
      data: { public: { maintenance: window } },
    });

    expect(await getMaintenance(config, { fetch })).toEqual(window);
    expect(urls).toEqual(["https://api.test/public/acme/ws/graphql"]);
  });

  it("answers null when no freeze is set", async () => {
    const { fetch } = answering({ data: { public: { maintenance: null } } });

    expect(await getMaintenance(config, { fetch })).toBeNull();
  });
});

describe("maintenanceRefusal", () => {
  it("reads when to retry from a refusal", () => {
    const error = new CmssyGraphqlError("refused", [
      {
        message: "cmssy is under scheduled maintenance",
        extensions: {
          code: "MAINTENANCE",
          endsAt: "2026-11-11T00:00:00.000Z",
          retryAfter: 3600,
        },
      },
    ]);

    expect(maintenanceRefusal(error)).toEqual({
      endsAt: "2026-11-11T00:00:00.000Z",
      retryAfter: 3600,
    });
  });

  it("still recognises a refusal that carries no timing", () => {
    const error = new CmssyGraphqlError("refused", [
      { extensions: { code: "MAINTENANCE" } },
    ]);

    expect(maintenanceRefusal(error)).toEqual({ endsAt: null, retryAfter: null });
  });

  it.each([
    ["another GraphQL refusal", new CmssyGraphqlError("x", [{ extensions: { code: "BAD_USER_INPUT" } }])],
    ["a plain error", new Error("network")],
    ["nothing", undefined],
  ])("is null for %s", (_name, error) => {
    expect(maintenanceRefusal(error)).toBeNull();
  });
});
