import { describe, expect, it } from "vitest";
import * as entry from "../index";

/**
 * The public surface, written down.
 *
 * Every release round of this SDK has justified itself partly by what it did
 * NOT add, and nothing checked that claim - "the surface grows by one function"
 * was a sentence in a pull request. This makes it a diff: adding or removing an
 * export fails here, and the fix is to update the list on purpose.
 */
describe("@cmssy/react public surface", () => {
  it("exports exactly these names", () => {
    expect(Object.keys(entry).sort()).toMatchSnapshot();
  });
});
