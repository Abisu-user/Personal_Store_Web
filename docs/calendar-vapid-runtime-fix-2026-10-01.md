# Calendar VAPID runtime validator correction — 2026-10-01

## Scope and verified cause

Only VAPID validation and its safe diagnostic display changed. No key generation/rotation, subscription reset, permission request, worker modification, database/migration, Calendar CRUD, scheduler or cron change was made. The unrelated app-lock-provider working-tree change is excluded.

The old validator did **not** require an encoded length of 88. It required canonical unpadded Base64URL, decoded public length 65 and private length 32. Public prefix had to be 0x04. It then called `ECDH.convertKey(bytes, "prime256v1")` followed by WebCrypto raw ECDSA/P-256 import in one try/catch. Any exception became `P256_POINT_IMPORT_FAILED` and `PUBLIC_KEY`, even when import had never been attempted.

Verified with deterministic, test-only scalar 1 on Deno 2.1.4:

```json
{"runtime":"2.1.4","encodedLength":87,"decodedLength":65,"firstByte":4,"convertResult":"Error: Not implemented: crypto.ECDH.prototype.convertKey","webCryptoImport":"valid"}
```

Before the fix, both original Deno tests failed because even valid keys were reported PUBLIC_KEY. After the fix, the same runtime passes all four tests, including real web-push 3.6.7 request encryption and ES256 JWT signature verification. This proves the custom validator can falsely reject legitimate keys on older Deno. It does not independently prove the Production key's validity: those secret bytes were not available to this local process and were not retrieved or printed.

References: [Deno Node crypto compatibility](https://docs.deno.com/api/node/crypto/#class-ecdh), [web-push 3.6.7 VAPID implementation](https://github.com/web-push-libs/web-push/blob/v3.6.7/src/vapid-helper.js), [Supabase Deno 2.1 compatible rollout](https://supabase.com/changelog/37941-all-regions-now-run-deno-2-1-compatible-release).

## Replacement validation

- Canonical, unpadded Base64URL. 87 encoded public characters are valid; no padding is required or appended to stored values.
- Public decoded length 65; first byte 0x04.
- Check canonical P-256 coordinates against the public curve equation. This does not sign, generate keys or implement private scalar multiplication. It avoids an unimplemented Node API and rejects malformed points even on WebCrypto versions that defer curve checks.
- Separately perform WebCrypto `importKey("raw", ..., ECDSA/P-256, false, ["verify"])`. The exact category is `PUBLIC_KEY_P256_IMPORT_FAILED` if import itself fails; off-curve points instead report `PUBLIC_KEY_NOT_ON_CURVE`.
- Private format remains the library's raw 32-byte Base64URL scalar, not PEM/PKCS8. Check 1 <= d < curve order before native crypto (older Deno can panic rather than throw for malformed EC data).
- Use the existing `createECDH("prime256v1")` to derive the public point. Import the private key as a proper EC JWK with internally derived x/y and existing d, never ECDSA-private raw import.
- Constant-time compare the derived public point to the configured VAPID public point. Subscription `p256dh` is never used for application-server key pairing.
- Subject: parsed URL with valid HTTPS host or mailto contact, without stored quotes/whitespace. New safe `uriType` reports https/mailto/unsupported/invalid, never its value.
- Existing web-push `setVapidDetails` remains the library initialization gate. Server Ready requires structural/curve/import/pair/public-match/subject/library success. Provider acceptance remains separate from actual device receipt.

Public diagnostics add prefix, curve result, structural result and import result. Private diagnostics add expected raw format and import result, but **never** a private first byte, value or fingerprint. The Next.js boundary allowlists fields, enums and issue codes. No raw exceptions are forwarded.

## Subject update and authority blocker

The user-provided Production screenshot reports subject length 18, no quotes/whitespace/newline, and INVALID_CONTACT_URI. Its exact value was not available, so it would be incorrect to claim it is a particular bare email/string.

The explicitly requested update to VAPID_SUBJECT=https://personal-store-web.vercel.app was attempted on project vnikvpgjwxkrspklmfwz. Supabase rejected it with insufficient account privileges. **The remote Subject was not updated.** No other keys were touched. An authorized project account must perform that one setting change. According to [Supabase secrets documentation](https://supabase.com/docs/guides/functions/secrets), production secret writes require Owner/Administrator; updating secrets does not itself require function redeployment. This code correction does require redeployment.

## Requested result checklist (Production vs local evidence)

| Item | Result |
| --- | --- |
| 1. Original PUBLIC_KEY condition | Canonical Base64URL + 65 decoded bytes + 0x04 + convertKey and WebCrypto in the same catch. No fixed 88-character requirement. |
| 2. Why 87 / 65 / valid encoding failed | Deno 2.1.4 convertKey stub throws before public import. Reproduced with a known valid point. |
| 3. Public first byte | Test keys: 0x04. Production: awaits new diagnostic, unchanged key. |
| 4. Public WebCrypto import | Test keys: valid in Deno 2.1.4 and 2.9.6. Production: unconfirmed. |
| 5. Public validity | Local compatible validator verified. Production key cannot yet be certified from byte length/fingerprint alone. |
| 6. Private decoded length | Fixtures: 32. Production: unconfirmed in the provided cropped screenshots. |
| 7. Private validity | Fixtures: valid scalar/JWK import; invalid scalars/PEM rejected. Production: unconfirmed. |
| 8. Key pair | Fixtures: matched; different scalar correctly rejected. Production: unconfirmed. |
| 9. Old Subject | Known invalid contact URI, length 18; exact input/type not retrieved. |
| 10. Subject updated | No: remote write rejected for insufficient privileges. User/admin action required. |
| 11. Server Configured | Tests: true only after all validation/library gates. Production not yet confirmed. |
| 12. Server Ready | Tests: DISPATCH_READY. Production not yet confirmed. |
| 13. Push Attempted | Mock tests: true only for authorized test after validation; no real Production send in this turn. |
| 14. Provider HTTP | Mock acceptance 201 and error classifications pass. Actual Provider status not available. |
| 15–18. iPhone / background / closed app / lock screen | Not verifiable locally; no claim of delivery. Must be tested after Ready. |
| 19. Key replacement | None. |
| 20. Old subscription | Client subscription/permission code and stored subscription data untouched; reuse regression passes. |
| 21. Build | npm run build passes. |
| 22. Lint | Modified code/tests: passes. Full npm run lint: existing 89 errors / 50 warnings, outside this change. |
| 23. Typecheck | npx tsc --noEmit and Deno 2.1.4 check both pass. |

## Verification commands and results

- Node API/Edge/security regression: 21/21 passed, including public/private import failure and unverified legacy report gates.
- Deno 2.1.4: 4/4 passed. Same tests in Deno 2.9.6: 4/4 passed.
- Deno check: Edge entrypoint and test file pass under 2.1.4.
- Browser fixture: 375/390/430/700/701/768/820/821/1024/1440px, light/dark, no horizontal overflow. New 0x04/import/Ready display confirmed.
- Browser flows: mocked Provider acceptance != user receipt, Subject rejection, explicit opt-out, existing granted subscription, default gesture + transient DB failure/retry all pass. No event/cron requests.
- Browser screenshots: C:\Users\User\AppData\Local\Temp\vault-calendar-push-it8ao1.
- git diff --check passes (normal Windows LF/CRLF warnings).

## User deployment steps

Run in PowerShell, using the authorized Supabase account. Do not paste private keys or dispatch secrets into chat.

```powershell
Set-Location "C:\Users\User\Documents\Codex\2026-08-14\sites-plugin-sites-openai-bundled-2\vault-app"

npx supabase secrets set VAPID_SUBJECT=https://personal-store-web.vercel.app --project-ref vnikvpgjwxkrspklmfwz

npx supabase functions deploy send-calendar-test-push --workdir "C:\Users\User\Documents\Codex\2026-08-14\sites-plugin-sites-openai-bundled-2\vault-app" --project-ref vnikvpgjwxkrspklmfwz --no-verify-jwt --use-api

$calendarVapidFiles = @(
  "supabase/functions/send-calendar-test-push/vapid-validation.ts"
  "supabase/functions/send-calendar-test-push/vapid-validation.test.ts"
  "src/lib/calendar/push-diagnostics.ts"
  "src/lib/calendar/push-dispatcher.ts"
  "src/components/calendar/calendar-notifications.tsx"
  "scripts/calendar/push-diagnostics.test.cjs"
  "scripts/calendar/push-notification-browser.cjs"
  "docs/calendar-vapid-runtime-fix-2026-10-01.md"
)
git add -- $calendarVapidFiles
git --no-pager diff --cached --stat
```

Confirm only the eight specified files are staged, then:

```powershell
git commit -m "Fix VAPID validation compatibility with older Deno"
git push origin main
```

Confirm latest Vercel Production deployment Ready. Refresh the existing iPhone PWA without removing it or resetting the subscription. Open notification settings, refresh diagnostics. Require public/ private import valid, Subject valid, pair true, matching public fingerprints, library valid, Server READY before test notification. Do not proceed to Cron until real Provider acceptance and iPhone receipt are confirmed. If Subject update returns 403, stop that setting step and use the correct authorized project account; no key rotation or permission reset is a workaround.
