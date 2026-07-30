import { describe, expect, it } from "vitest";
import * as index from "../index";

describe("@cmssy/astro public surface", () => {
  it("exports exactly these names", () => {
    expect(Object.keys(index).sort()).toMatchSnapshot();
  });
});
