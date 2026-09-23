# Global Background Job mutation audit

Date: 2026-09-23

## Scope and counting

- Static scan found **118 client HTTP method call sites** (`POST`, `PATCH`, `PUT`, `DELETE`). This is evidence, not a user-flow count: one logical batch flow can contain several requests and one action endpoint can serve several branches.
- Normalizing those call sites into user-facing handlers produced **95 mutation flows**.
- **66 flows** now enter the global background queue.
- **27 flows** remain blocking by design because they establish identity, authorization, encryption state, destructive account-wide state, or require an immediate authoritative response before the next screen is safe.
- **2 telemetry flows** were already fire-and-forget and remain outside the queue (bookmark open tracking and security activity heartbeat).
- The source currently contains **73 `enqueue()` integration sites**. The difference from 66 logical flows is caused by separate UI entry points sharing the same logical action.

## Feature coverage

| Feature | Background queue | Intentionally blocking | Existing nonblocking | Notes |
| --- | ---: | ---: | ---: | --- |
| Bookmarks | 14 | 2 | 1 | Create/update/cover, delete/restore/permanent, batch, taxonomy, ordering. Unlock/lock verification blocks. Open tracking remains telemetry. |
| Anime + adult library | 7 | 2 | 0 | Item save/delete, cover, batch, folders, categories. Adult authorization and PIN/security setting confirmation block. |
| Notes | 5 | 0 | 0 | Save/cover, trash/restore, permanent delete, batch organize, batch delete. |
| Code | 5 | 0 | 0 | Save/cover, trash/restore, permanent delete, batch organize, batch delete. |
| Files | 4 | 0 | 0 | Upload/finalize, trash/restore, permanent delete, batch actions. |
| Photos | 5 | 0 | 0 | Upload/finalize, metadata edit, trash/restore, permanent delete, batch actions. |
| KTV | 6 | 0 | 0 | Song save/delete, batch category, category create/update/delete. |
| Vault | 6 | 2 | 0 | Encrypted item save/delete, batch, category create/update/delete. Vault initialization and unlock block. Job labels never include secret content. |
| Vocabulary | 7 | 2 | 0 | Card save/delete, organize, taxonomy, settings, favorite and batch import. Review/quiz result commit blocks because the next result state depends on authoritative mastery updates. |
| Calendar | 2 | 0 | 0 | Event save and optimistic delete. |
| Appearance/backgrounds | 3 | 0 | 0 | Coalesced settings sync, background upload, background removal/reset. |
| Profile | 1 | 1 | 0 | Profile mutation backgrounds; password change blocks. |
| Shared taxonomy/locks | 1 | 2 | 0 | General folder/category CRUD backgrounds; lock configure/remove blocks. |
| Auth/email/MFA/security | 0 | 13 | 1 | Login, OTP, reset, MFA, passkey, App Lock, permissions, account deletion and session revocation are authoritative security flows. Security heartbeat remains telemetry. |
| Admin/system quota | 0 | 3 | 0 | Quota reduction/ownership-sensitive administration retains confirmation and concurrency checks. |

## Loading audit

Removed for queue-backed mutations:

- Anime save/update/delete refresh pending path and the generic `正在儲存動漫資料` fallback.
- Bookmark save/delete/taxonomy/manager operation overlays.
- Notes, Code, Files and Photos mutation `OperationStatus` overlays.
- KTV song/category mutation pending state.
- Calendar editor/delete pending state.
- Profile data save overlay (password overlay remains).
- Vault item and category pending state (initialization/unlock pending remains).

Retained:

- Initial page/list loading and skeletons.
- Authentication, MFA, PIN, App Lock, folder unlock and Vault unlock progress.
- Vocabulary review/quiz result commit progress, because the result screen depends on returned mastery changes.
- Admin quota and account deletion confirmation/progress.

## Queue guarantees

- Provider is mounted in the authenticated App Shell, so work survives feature-route unmounts.
- Maximum three concurrent jobs; entity keys serialize conflicting work.
- Retriable failures: offline, `429`, `5xx`, timeout/network errors. Backoff is 800 ms, then 1600 ms, with manual retry after terminal failure.
- Persistable non-sensitive `PATCH`/`PUT` jobs can survive reload in IndexedDB. Sensitive Vault jobs and binary/executable jobs are never persisted.
- Optimistic delete/update flows provide rollback callbacks after terminal failure.
- Uploads report real stage labels or indeterminate progress; batch vocabulary import reports completed item ratio. No fake upload percentage is emitted.
- A mutation that succeeded on the server is marked successful even if its later local refresh callback fails; refresh failure no longer replays or rolls back the mutation.

## App Shell status UI

- Exactly one status entry is rendered by the authenticated App Shell.
- The entry is a fixed-size 38 px icon in reserved normal-flow space, not a viewport-fixed pill.
- Saved state is low-emphasis; active/error/offline states use icon plus badge without changing container width.
- Mobile opens the queue as a safe-area-aware bottom sheet; desktop opens a compact popover.
- Reduced-motion disables spinner/panel transitions.

