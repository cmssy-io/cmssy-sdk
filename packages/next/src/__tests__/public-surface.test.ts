import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import * as index from "../index";
import * as server from "../server";
import * as middleware from "../middleware";

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
