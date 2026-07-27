import { describe, expect, it } from "vitest";
import * as index from "../index";

/**
 * The public surface, written down. Adding or removing an export fails here,
 * and the fix is to update the list on purpose - which is the point: this
 * package's adapters gained options and result fields in 11.1.0 without any
 * check that the surface grew by what the release said it grew by.
 */
describe("@cmssy/astro public surface", () => {
  it("exports exactly these names", () => {
    expect(Object.keys(index).sort()).toMatchSnapshot();
  });
});
