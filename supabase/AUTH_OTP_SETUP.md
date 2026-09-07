# Supabase Email OTP setup

The application verifies signup and password-recovery codes through server
routes. Supabase Auth still creates, hashes, expires, replaces, and emails the
actual OTP. Do not include `ConfirmURL` or `RedirectTo` in these two templates.

In Supabase Dashboard open **Authentication → Email Templates**.

## Confirm signup

Subject:

```text
Email 驗證碼
```

Body:

```html
<h2>Email 驗證碼</h2>
<p>你的驗證碼：</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px">{{ .Token }}</p>
<p>此驗證碼將於 10 分鐘後失效。</p>
<p>如果不是你本人操作，可以忽略此 Email。</p>
```

## Reset password / Recovery

Subject:

```text
密碼重設驗證碼
```

Body:

```html
<h2>密碼重設驗證碼</h2>
<p>你的密碼重設驗證碼：</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px">{{ .Token }}</p>
<p>此驗證碼將於 10 分鐘後失效。</p>
<p>如果不是你本人要求重設密碼，可以忽略此 Email。</p>
```

In **Authentication → Settings**, set the email OTP expiry to `600` seconds.
The application also enforces the same ten-minute limit on the server, so an
older provider token cannot be accepted through the application.

Set **Site URL** to the production deployment URL and keep development URLs
only in the additional redirect URL list. The OTP flows do not use callback
links, but this prevents unrelated future authentication flows from falling
back to localhost.
