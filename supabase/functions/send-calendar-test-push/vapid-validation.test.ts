// Deno/npm compatibility test. Deterministic test-only keys; no production env or network sends.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { ECDH, createECDH } from "node:crypto";
import webPush from "npm:web-push@3.6.7";
import { validateVapid } from "./vapid-validation.ts";

function fixture(scalar: number) {
  const privateBytes = Buffer.alloc(32); privateBytes[31] = scalar;
  const curve = createECDH("prime256v1"); curve.setPrivateKey(privateBytes);
  return { publicKey: curve.getPublicKey().toString("base64url"), privateKey: privateBytes.toString("base64url") };
}
const keys = fixture(1), other = fixture(2), subject = "https://personal-store-web.vercel.app";

Deno.test("real Deno web-push validates raw keys, encrypts payload and signs a valid ES256 VAPID JWT", async () => {
  const result = await validateVapid(keys.publicKey, keys.privateKey, subject, keys.publicKey);
  assert.equal(result.failure, null); assert.equal(result.pairMatch, true); assert.equal(result.publicKeyMatch, true);
  assert.equal(result.publicKey.length, 87); assert.equal(result.publicKey.decodedLength, 65);
  assert.equal(result.publicKey.firstByte, 4); assert.equal(result.publicKey.pointOnCurve, true);
  assert.equal(result.publicKey.structuralValid, true); assert.equal(result.publicKey.importValidation, "valid");
  assert.equal(result.privateKey.decodedLength, 32); assert.equal(result.privateKey.importValidation, "valid");
  assert.equal(result.subject.uriType, "https");
  webPush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  const request = webPush.generateRequestDetails({ endpoint: "https://web.push.apple.com/test-only-not-a-subscription",
    keys: { p256dh: other.publicKey, auth: Buffer.alloc(16, 1).toString("base64url") } }, "test-only payload", { TTL: 300 });
  assert.equal(request.method, "POST"); assert.ok(request.body.length > 0);
  const authorization = request.headers.Authorization;
  assert.ok(authorization.startsWith("vapid t="));
  const jwt = authorization.match(/t=([^, ]+)/)?.[1]; assert.ok(jwt);
  const [header, payload, signature] = jwt.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  assert.equal(claims.aud, "https://web.push.apple.com"); assert.equal(claims.sub, subject);
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 24 * 60 * 60);
  const publicKey = await crypto.subtle.importKey("raw", Buffer.from(keys.publicKey, "base64url"), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.equal(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey,
    Buffer.from(signature, "base64url"), new TextEncoder().encode(`${header}.${payload}`)), true);
});

Deno.test("classifies malformed subject, quoted/padded/PEM private key, off-curve point and mismatched pair", async () => {
  for (const contact of ["personal-store", "test@example.test", '"https://example.test"', "mailto:test@example.test\n"]) {
    const result = await validateVapid(keys.publicKey, keys.privateKey, contact, keys.publicKey);
    assert.equal(result.failure, "SUBJECT");
  }
  for (const privateKey of ['"' + keys.privateKey + '"', keys.privateKey + "=", "\n" + keys.privateKey, "-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----"]) {
    const result = await validateVapid(keys.publicKey, privateKey, subject, keys.publicKey);
    assert.equal(result.failure, "PRIVATE_KEY"); assert.equal(result.pairMatch, null);
    assert.ok(!JSON.stringify(result).includes(privateKey));
  }
  const mismatch = await validateVapid(keys.publicKey, other.privateKey, subject, keys.publicKey);
  assert.equal(mismatch.failure, "PAIR"); assert.equal(mismatch.pairMatch, false);
  const badPoint = Buffer.alloc(65); badPoint[0] = 4;
  const offCurve = await validateVapid(badPoint.toString("base64url"), keys.privateKey, subject, keys.publicKey);
  assert.equal(offCurve.failure, "PUBLIC_KEY"); assert.ok(offCurve.publicKey.issues.includes("PUBLIC_KEY_NOT_ON_CURVE"));
  assert.equal(offCurve.publicKey.pointOnCurve, false); assert.equal(offCurve.publicKey.importValidation, "not-checked");
});

Deno.test("valid 87-character unpadded keys do not depend on the older Deno convertKey stub", async () => {
  const original = ECDH.convertKey;
  ECDH.convertKey = () => { throw new Error("Not implemented: crypto.ECDH.prototype.convertKey"); };
  try {
    for (const scalar of [1, 2, 7, 128]) {
      const value = fixture(scalar);
      const result = await validateVapid(value.publicKey, value.privateKey, subject, value.publicKey);
      assert.equal(result.failure, null); assert.equal(result.pairMatch, true);
      assert.equal(result.publicKey.importValidation, "valid");
    }
  } finally { ECDH.convertKey = original; }
});

Deno.test("rejects malformed points and out-of-range scalars before old Deno native crypto can panic", async () => {
  const wrongPrefix = Buffer.from(keys.publicKey, "base64url"); wrongPrefix[0] = 2;
  const prefix = await validateVapid(wrongPrefix.toString("base64url"), keys.privateKey, subject, keys.publicKey);
  assert.equal(prefix.failure, "PUBLIC_KEY"); assert.equal(prefix.publicKey.firstByte, 2);
  assert.ok(prefix.publicKey.issues.includes("EXPECTED_UNCOMPRESSED_POINT"));
  const outOfField = Buffer.from(keys.publicKey, "base64url"); outOfField.fill(255, 1, 33);
  const coordinate = await validateVapid(outOfField.toString("base64url"), keys.privateKey, subject, keys.publicKey);
  assert.ok(coordinate.publicKey.issues.includes("PUBLIC_KEY_NOT_ON_CURVE"));
  for (const bytes of [Buffer.alloc(32), Buffer.alloc(32, 255), Buffer.from("ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551", "hex")]) {
    const result = await validateVapid(keys.publicKey, bytes.toString("base64url"), subject, keys.publicKey);
    assert.equal(result.failure, "PRIVATE_KEY"); assert.equal(result.privateKey.importValidation, "not-checked");
    assert.ok(result.privateKey.issues.includes("PRIVATE_KEY_SCALAR_OUT_OF_RANGE"));
  }
});
