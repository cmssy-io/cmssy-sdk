import { describe, expect, it } from "vitest";
import * as entry from "../index";

describe("@cmssy/react public surface", () => {
  it("exports exactly these names", () => {
    expect(Object.keys(entry).sort()).toMatchSnapshot();
  });
});
