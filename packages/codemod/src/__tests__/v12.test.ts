import { describe, expect, it } from "vitest";

import { transform } from "../v12";

describe("v12", () => {
  it("says nothing about a file with no media field", () => {
    const result = transform("export const props = { title: fields.text({}) };");

    expect(result.changed).toBe(false);
    expect(result.notes).toBeUndefined();
  });

  it("explains the new shape when a block declares a media field", () => {
    const result = transform(
      "export const props = { image: fields.media({ label: 'Image' }) };",
    );

    expect(result.changed).toBe(false);
    expect(result.notes?.[0]).toContain("no longer the asset's URL");
  });

  it("never rewrites the source - a url read cannot be fixed safely by hand-off", () => {
    const source = "const p = { image: fields.media({}) };\n<img src={content.image} />";
    const result = transform(source);

    expect(result.code).toBe(source);
    expect(result.changed).toBe(false);
  });

  it("points at the direct uses it found, so they are not hunted by hand", () => {
    const result = transform(
      [
        "const props = { image: fields.media({}) };",
        "<img src={content.image} />",
        "<img src={content.cover} />",
      ].join("\n"),
    );

    const listed = result.notes?.find((n) => n.startsWith("Direct uses"));
    expect(listed).toContain("src={content.image}");
    expect(listed).toContain("src={content.cover}");
  });
});
