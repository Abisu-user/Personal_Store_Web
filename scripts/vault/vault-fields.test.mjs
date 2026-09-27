import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { normalizeVaultPayload, serializeVaultPayload } from "../../src/components/vault/vault-fields.ts";

test("legacy username/secret remains readable as editable ordered fields", () => {
  const payload = normalizeVaultPayload({ label: "舊資料", username: "user@example.com", secret: "old-password", notes: "note" });
  assert.equal(payload.fields.length, 2);
  assert.deepEqual(payload.fields.map(({ label, value, type, order }) => ({ label, value, type, order })), [
    { label: "帳號", value: "user@example.com", type: "text", order: 0 },
    { label: "密碼", value: "old-password", type: "password", order: 1 },
  ]);
  assert.deepEqual(normalizeVaultPayload({ label: "舊資料", username: "user@example.com", secret: "old-password" }).fields.map((field) => field.id), payload.fields.map((field) => field.id));
});

test("renamed fields preserve IDs, type, order and untrimmed values", () => {
  const payload = serializeVaultPayload(" New ", " Note ", [
    { id: "stable-account", label: " 登入 Email ", value: "  example@gmail.com  ", type: "text", order: 5 },
    { id: "stable-secret", label: " API Key ", value: " secret ", type: "password", order: 2 },
  ]);
  assert.deepEqual(payload.fields.map((field) => [field.id, field.label, field.value, field.type, field.order]), [
    ["stable-account", "登入 Email", "  example@gmail.com  ", "text", 0],
    ["stable-secret", "API Key", " secret ", "password", 1],
  ]);
  assert.deepEqual(normalizeVaultPayload(payload), payload);
});

test("unknown field types never reveal values as ordinary text", () => {
  const payload = normalizeVaultPayload({ label: "x", fields: [{ id: "one", label: "Token", value: "secret", type: "future-sensitive", order: 0 }] });
  assert.equal(payload.fields[0].type, "password");
});

test("the complete dynamic payload survives the existing AES-GCM envelope", async () => {
  const key = await webcrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const nonce = webcrypto.getRandomValues(new Uint8Array(12));
  const aad = { entryId: "test-entry", version: 1 };
  const payload = serializeVaultPayload("Example", "", [
    { id: "a", label: "帳號", value: "A", type: "text", order: 0 },
    { id: "b", label: "安全密碼", value: "B", type: "password", order: 1 },
  ]);
  const encoder = new TextEncoder();
  const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: encoder.encode(JSON.stringify(aad)) }, key, encoder.encode(JSON.stringify(payload)));
  const decrypted = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, additionalData: encoder.encode(JSON.stringify(aad)) }, key, ciphertext);
  assert.deepEqual(normalizeVaultPayload(JSON.parse(new TextDecoder().decode(decrypted))), payload);
});
