import { describe, expect, it, vi } from "vitest";

// `/server` pulls in `server-only`, which throws outside a server component.
// Stubbing it is what lets the surface be inspected at all - the alternative is
// listing the entry's exports by hand, which is the thing this test replaces.
vi.mock("server-only", () => ({}));
import * as index from "../index";
import * as server from "../server";
import * as middleware from "../middleware";

/**
 * The public surface, written down.
 *
 * Every release round of this SDK has justified itself partly by what it did
 * NOT add, and nothing checked that claim - "the surface grows by one function"
 * was a sentence in a pull request. This makes it a diff: adding or removing an
 * export fails here, and the fix is to update the list on purpose.
 *
 * Every entry point, not just the root: this package keeps its page and layout
 * API under `/server`, which is exactly where an accidental export would go.
 */
describe("@cmssy/next public surface", () => {
  it("exports exactly these names from the root", () => {
    expect(Object.keys(index).sort()).toMatchSnapshot();
  });

  it("exports exactly these names from /server", () => {
    expect(Object.keys(server).sort()).toMatchSnapshot();
  });

  it("exports exactly these names from /middleware", () => {
    expect(Object.keys(middleware).sort()).toMatchSnapshot();
  });
});
