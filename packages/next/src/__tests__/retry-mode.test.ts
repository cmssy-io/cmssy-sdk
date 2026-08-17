import { afterEach, describe, expect, it } from "vitest";

import { nextRetryMode, NEXT_BUILD_PHASE } from "../retry-mode";

const original = process.env.NEXT_PHASE;

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PHASE;
  else process.env.NEXT_PHASE = original;
});

describe("nextRetryMode (CMS-1463)", () => {
  it("picks the build mode while next build is prerendering", () => {
    process.env.NEXT_PHASE = "phase-production-build";

    expect(nextRetryMode()).toBe("build");
  });

  it("picks the interactive mode when a visitor is waiting", () => {
    process.env.NEXT_PHASE = "phase-production-server";

    expect(nextRetryMode()).toBe("interactive");
  });

  it("picks the interactive mode when the phase is not set at all", () => {
    delete process.env.NEXT_PHASE;

    expect(nextRetryMode()).toBe("interactive");
  });

  it("reads the phase per call, not once at import", () => {
    delete process.env.NEXT_PHASE;
    expect(nextRetryMode()).toBe("interactive");

    process.env.NEXT_PHASE = NEXT_BUILD_PHASE;

    expect(nextRetryMode()).toBe("build");
  });

  it("names the phase constant next itself uses", () => {
    expect(NEXT_BUILD_PHASE).toBe("phase-production-build");
  });
});
