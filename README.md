# Personal Digital Vault

Security-first personal storage for bookmarks, notes, code, files, and encrypted Vault records.

## Foundation delivered

- Next.js App Router + TypeScript application base.
- Supabase SSR PKCE session plumbing, server-side user verification, and safe auth callback.
- Versioned initial Postgres/RLS/private Storage schema in `supabase/migrations/`.
- Architecture, data model, cryptography contract, deployment contract, and module order in `docs/architecture.md`.

## Local setup

1. Copy `.env.example` to `.env.local` and set the Supabase URL and publishable key.
2. Install dependencies: `npm install`.
3. Run `npm run dev`.

`SUPABASE_SECRET_KEY` is server-only and must never be committed or placed in a `NEXT_PUBLIC_` variable.

## Required external setup before the first module

1. Authorize the Supabase integration for project `vnikvpgjwxkrspklmfwz` or apply the reviewed migration through the Supabase SQL/migration workflow.
2. In Supabase Auth, enable email confirmation, configure the site URL and redirect URL `/api/auth/callback`, set reasonable session limits, and enable TOTP MFA.
3. Create a GitHub repository, push this project, then import it into Vercel.
4. Configure the four names in `.env.example` separately for Development, Preview, and Production; Preview must not use production data.
