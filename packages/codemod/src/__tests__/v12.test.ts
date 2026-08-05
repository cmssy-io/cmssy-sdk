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
    expect(result.notes?.join(" ")).toContain("no longer the asset's URL");
  });

  it("never rewrites the source - a url read cannot be fixed safely by hand-off", () => {
    const source = "const p = { image: fields.media({}) };\n<img src={content.image} />";
    const result = transform(source);

    expect(result.code).toBe(source);
    expect(result.changed).toBe(false);
  });

  it("names the media fields it found, so the notes are about this file", () => {
    const result = transform(
      "const props = { image: fields.media({}), gallery: fields.media({ multiple: true }) };",
    );

    expect(result.notes?.[0]).toBe("Media fields in this file: image, gallery.");
  });

  it("lists the lines that read a media field, and only those", () => {
    const result = transform(
      [
        "const props = { image: fields.media({}) };",
        "<img src={content.image} />",
        "<img src={content.unrelated} />",
        "<img src={props.logo} />",
      ].join("\n"),
    );

    const listed = result.notes?.find((n) => n.startsWith('Lines reading "image"'));
    expect(listed).toContain("src={content.image}");
    expect(listed).not.toContain("content.unrelated");
    expect(listed).not.toContain("props.logo");
  });

  it("says nothing about a media-shaped read when no media field is declared", () => {
    const result = transform("<img src={content.image} />");

    expect(result.notes).toBeUndefined();
  });
});
