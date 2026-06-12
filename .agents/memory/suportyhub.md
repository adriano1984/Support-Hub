---
name: SuportyHub project
description: Key architecture decisions and gotchas for the WhatsApp helpdesk ticket system migrated from a zip archive
---

## What this project is
WhatsApp-based helpdesk/ticket management system in Brazilian Portuguese. No external database — uses Node.js built-in SQLite (`node:sqlite`, `--experimental-sqlite` flag). WhatsApp via `@whiskeysockets/baileys`.

## Auth
Cookie-based JWT (HttpOnly), NOT Bearer tokens. `SESSION_SECRET` env var required. Default admin: username `Admin`, password `96281800`.

## Frontend fetch pattern
Most pages use custom `apiFetch` from `src/lib/api.ts`. Only Settings pages (branches/departments/categories/messages/whatsapp) use generated React Query hooks from `@workspace/api-client-react`.

**Why:** The app was migrated from a zip; the original author used `apiFetch` for most routes and only used codegen for Settings. Do not change this without updating all pages.

## CSS theme
`artifacts/helpdesk/src/index.css` uses Tailwind CSS v4 with custom HSL CSS variables. All `--background`, `--foreground`, etc. were "red" placeholders in the zip and were replaced with a professional blue/slate theme during migration.

## Missing peer dep (safe to ignore)
`@whiskeysockets/baileys` warns about missing `sharp` peer dep. This is optional (only needed for image resizing) — does not break functionality.

## Key files
- `artifacts/api-server/src/lib/database.ts` — SQLite schema + seeding (DO NOT REPLACE; run `pnpm --filter @workspace/db run push` does NOT apply here)
- `lib/api-spec/openapi.yaml` — OpenAPI contract; run codegen after changes
- `lib/db/` — Drizzle/PostgreSQL package exists in template but is NOT used by this project
