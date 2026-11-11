# Project guidelines

## Repository structure

This is a monorepo for a WebRTC learning MVP.

- Root workspace: [package.json](package.json)
- Backend: [backend](backend)
- Frontend: [frontend](frontend)
- Shared contracts: [packages/contracts](packages/contracts)
- Local database config: [compose.yaml](compose.yaml)
- Design and plan docs: [docs](docs)

## Stack and architecture

- Backend: NestJS + TypeScript + Prisma + Socket.IO + PostgreSQL
- Frontend: Next.js + React + TypeScript + socket.io-client
- Shared contract package: TypeScript + Zod validation
- Signaling model: room metadata and WebRTC signaling are validated and relayed over WebSockets; media stays peer-to-peer
- Database: PostgreSQL in Docker Compose for room metadata and lifecycle state

## Working conventions

- Prefer workspace-aware commands from the repo root, such as `npm run build` and `npm test`.
- Keep feature boundaries clear: server transport logic and Socket.IO gateways in the backend, UI/state logic in the frontend, and shared validation/contract schemas in the shared package.
- Put validation at entry points and define strict room/session payload contracts instead of accepting raw objects.
- Keep browser-only WebRTC APIs inside the frontend layer and avoid mixing them into server-rendered code.
- Do not expose SDP, ICE candidates, or other media-sensitive data in logs.

## Backend conventions

- Use NestJS modules, services, and gateways rather than ad hoc Express handlers.
- Keep Prisma access behind repository/service boundaries and do not query the database directly from controllers or gateways.
- Validate signaling payloads before processing them and reject malformed or unknown message types explicitly.
- Treat reconnect, duplicate, timeout, and room-expiry flows as idempotent operations where possible.

## Frontend conventions

- Use the Next.js app router structure under [frontend](frontend) for pages and client-side UI.
- Keep browser peer connection lifecycle management in dedicated client modules and avoid server-side execution of WebRTC APIs.
- Reuse the shared contracts package for runtime validation and message shapes.

## Build and verification

- Root build: `npm run build`
- Root test: `npm test`
- Backend-specific build/test: `npm run build --workspace @webrtc/api` and `npm test --workspace @webrtc/api`
- Frontend-specific test: `npm test --workspace @webrtc/web`
- Use focused checks first, then broader verification, and report any pre-existing failures explicitly.

## Change discipline

- Make small, focused changes that preserve unrelated work.
- Add or update tests for behavior changes before claiming completion.
- Prefer explicit validation, error handling, and clear contracts over silent fallbacks or `any`-style lazy typing.
- Update directly related docs when behavior changes and verify the final patch with a quick diff check.
