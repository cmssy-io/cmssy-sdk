import { describe, it, expect, vi } from "vitest";
import { parseEditorMessage, postToEditor } from "../bridge/messages";
import { PROTOCOL_VERSION } from "../bridge/protocol";

const ORIGIN = "https://editor.cmssy.io";

describe("parseEditorMessage", () => {
  it("rejects an otherwise-valid message from the wrong origin", () => {
    expect(
      parseEditorMessage(
        { type: "cmssy:select", blockId: "b", protocolVersion: PROTOCOL_VERSION },
        "https://evil.com",
        ORIGIN,
      ),
    ).toBeNull();
  });

  it("normalizes the expected origin (path/trailing slash) before comparing", () => {
    expect(
      parseEditorMessage(
        { type: "cmssy:select", blockId: "b", protocolVersion: PROTOCOL_VERSION },
        ORIGIN,
        `${ORIGIN}/editor/`,
      ),
    ).toEqual({
      type: "cmssy:select",
      blockId: "b",
      protocolVersion: PROTOCOL_VERSION,
    });
  });

  it("accepts a select message with the matching protocol version", () => {
    expect(
      parseEditorMessage(
        { type: "cmssy:select", blockId: "b", protocolVersion: PROTOCOL_VERSION },
        ORIGIN,
        ORIGIN,
      ),
    ).toEqual({
      type: "cmssy:select",
      blockId: "b",
      protocolVersion: PROTOCOL_VERSION,
    });
  });

  it("rejects a select with a wrong protocol version", () => {
    expect(
      parseEditorMessage(
        { type: "cmssy:select", blockId: "b", protocolVersion: 999 },
        ORIGIN,
        ORIGIN,
      ),
    ).toBeNull();
  });

  it("accepts a patch with the matching protocol version", () => {
    expect(
      parseEditorMessage(
        {
          type: "cmssy:patch",
          blockId: "b",
          content: { x: 1 },
          protocolVersion: PROTOCOL_VERSION,
        },
        ORIGIN,
        ORIGIN,
      ),
    ).toEqual({
      type: "cmssy:patch",
      blockId: "b",
      content: { x: 1 },
      protocolVersion: PROTOCOL_VERSION,
    });
  });

  it("rejects a patch with a wrong protocol version", () => {
    expect(
      parseEditorMessage(
        { type: "cmssy:patch", blockId: "b", content: {}, protocolVersion: 999 },
        ORIGIN,
        ORIGIN,
      ),
    ).toBeNull();
  });

  it("rejects malformed or unknown messages", () => {
    expect(
      parseEditorMessage({ type: "cmssy:patch", blockId: "b" }, ORIGIN, ORIGIN),
    ).toBeNull();
    expect(parseEditorMessage("nope", ORIGIN, ORIGIN)).toBeNull();
    expect(parseEditorMessage({ type: "other" }, ORIGIN, ORIGIN)).toBeNull();
  });

  it("honors a wildcard expected origin", () => {
    expect(
      parseEditorMessage(
        { type: "cmssy:select", blockId: "b", protocolVersion: PROTOCOL_VERSION },
        "https://any.com",
        "*",
      ),
    ).toEqual({
      type: "cmssy:select",
      blockId: "b",
      protocolVersion: PROTOCOL_VERSION,
    });
  });
});

describe("postToEditor", () => {
  it("posts the message to the target with the editor origin", () => {
    const target = { postMessage: vi.fn() };
    const message = {
      type: "cmssy:ready" as const,
      protocolVersion: PROTOCOL_VERSION,
      blocks: [],
      schemas: {},
    };
    postToEditor(target, ORIGIN, message);
    expect(target.postMessage).toHaveBeenCalledWith(message, ORIGIN);
  });

  it("normalizes the editor origin before posting", () => {
    const target = { postMessage: vi.fn() };
    postToEditor(target, `${ORIGIN}/editor/`, {
      type: "cmssy:ready",
      protocolVersion: PROTOCOL_VERSION,
      blocks: [],
      schemas: {},
    });
    expect(target.postMessage).toHaveBeenCalledWith(expect.anything(), ORIGIN);
  });
});
