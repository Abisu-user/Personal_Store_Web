import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_IMAGE_ACCEPT,
  BACKGROUND_IMAGE_MAX_BYTES,
  backgroundImageExtensionForMimeType,
  backgroundImageMimeTypeForFile,
  normalizeBackgroundImageMimeType,
} from "../../src/lib/appearance/background-image-format.ts";

const supportedFiles = [
  ["photo.jpg", "image/jpeg", "image/jpeg"],
  ["photo.jpeg", "image/jpeg", "image/jpeg"],
  ["photo.png", "image/png", "image/png"],
  ["photo.webp", "image/webp", "image/webp"],
  ["photo.avif", "image/avif", "image/avif"],
];

test("accepts every supported background image MIME type", () => {
  for (const [name, type, expected] of supportedFiles) {
    assert.equal(backgroundImageMimeTypeForFile({ name, type }), expected);
  }
});

test("uses the extension only when a browser leaves file.type empty", () => {
  assert.equal(backgroundImageMimeTypeForFile({ name: "photo.jpeg", type: "" }), "image/jpeg");
  assert.equal(backgroundImageMimeTypeForFile({ name: "photo.avif", type: "" }), "image/avif");
  assert.equal(backgroundImageMimeTypeForFile({ name: "photo.jpeg", type: "application/octet-stream" }), null);
});

test("rejects HEIC, GIF, SVG, and non-standard JPEG MIME values", () => {
  assert.equal(backgroundImageMimeTypeForFile({ name: "photo.heic", type: "image/heic" }), null);
  assert.equal(backgroundImageMimeTypeForFile({ name: "photo.gif", type: "image/gif" }), null);
  assert.equal(backgroundImageMimeTypeForFile({ name: "photo.svg", type: "image/svg+xml" }), null);
  assert.equal(normalizeBackgroundImageMimeType("image/jpg"), null);
});

test("maps normalized storage MIME types to stable extensions", () => {
  assert.equal(backgroundImageExtensionForMimeType("image/jpeg"), ".jpg");
  assert.equal(backgroundImageExtensionForMimeType("image/png"), ".png");
  assert.equal(backgroundImageExtensionForMimeType("image/webp"), ".webp");
  assert.equal(backgroundImageExtensionForMimeType("image/avif"), ".avif");
  assert.equal(BACKGROUND_IMAGE_MAX_BYTES, 8_388_608);
});

test("file picker advertises MIME types and both JPEG extensions", () => {
  for (const value of [".jpg", ".jpeg", ".png", ".webp", ".avif", "image/jpeg", "image/png", "image/webp", "image/avif"]) {
    assert.ok(BACKGROUND_IMAGE_ACCEPT.split(",").includes(value), `${value} is missing from accept`);
  }
});
