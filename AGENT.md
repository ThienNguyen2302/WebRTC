# Project Guidelines

## Repository Scope

- This repository is a WebRTC learning project.
- The current implementation is under [`backend/`](./backend/) and uses Express, Mongoose, Joi, JWT, and TypeScript tooling.
- Do not assume NestJS, PostgreSQL, or Next.js exists in the current codebase. Treat those as target-stack guidance only when a task explicitly introduces them.
- Read the relevant skill before specialized work: [`webrtc-backend`](./.agents/skills/webrtc-backend/SKILL.md) or [`webrtc-frontend`](./.agents/skills/webrtc-frontend/SKILL.md).

## Architecture

- Keep HTTP and signaling handlers focused on transport concerns.
- Put business logic in services or equivalent modules and keep database access behind a clear data-access boundary.
- Define signaling contracts explicitly: room/session ID, participant identity, message type, payload, message ID, ordering, acknowledgements, retryability, and errors.
- Make retries and reconnects idempotent. Validate external input at the boundary and reject malformed or unknown messages.
- Keep browser-only WebRTC APIs out of server-rendered code when a frontend is added.

## Backend Conventions

- Preserve the existing Express/Mongoose/Joi conventions unless the task explicitly includes a framework or database migration.
- Never apply NestJS decorators, `ValidationPipe`, SQL, or PostgreSQL migration commands to the current backend.
- Do not place database queries in route handlers or use `any` to hide unclear contracts.
- Do not log secrets, tokens, SDP, or unnecessary media-sensitive payloads.

## Build and Test

- Inspect `backend/package.json` before running commands; use the repository's existing scripts rather than inventing new ones.
- Current backend test command: `npm test --prefix backend`.
- For signaling or production-hang work, trace one session end-to-end using correlation/session IDs before changing timeouts or retry counts.
- Verify duplicate, delayed, dropped, reordered, reconnect, authorization, malformed-input, and persistence-failure behavior when relevant.
- Run focused checks first, then the full available suite. Report pre-existing failures explicitly.

## Change Discipline

- Make small, focused changes and preserve unrelated work in the working tree.
- Add or update tests for behavior changes before claiming completion.
- Surface errors explicitly; do not silently default, swallow failures, or return success-shaped fallbacks.
- Update directly related documentation and verify the final diff with `git diff --check`.