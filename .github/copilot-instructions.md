# WebRTC repository instructions

## Workspace and commands

This is an npm workspace monorepo:

- `packages/contracts`: shared Zod schemas and inferred TypeScript types
- `backend`: NestJS API and Prisma/PostgreSQL persistence
- `frontend`: Next.js App Router client

Run workspace-aware commands from the repository root.

- Install: `npm install`
- Build all workspaces: `npm run build`
- Build contracts first when app workspaces consume stale `dist` output:
  `npm run build --workspace @webrtc/contracts`
- Build API: `npm run build --workspace @webrtc/api`
- Build web: `npm run build --workspace @webrtc/web`
- Lint all workspaces: `npm run lint`
- Test contracts: `npm test --workspace @webrtc/contracts`
- Test API: `npm test --workspace @webrtc/api`
- Test web: `npm test --workspace @webrtc/web`
- Run one test file with Vitest by passing it after `--`, for example:
  `npm test --workspace @webrtc/api -- src/rooms/rooms.service.spec.ts`
- Start PostgreSQL: `docker compose up -d postgres`
- Generate Prisma client: `npm exec -- prisma generate --schema backend/prisma/schema.prisma`
- Start API: `npm run start:dev --workspace @webrtc/api`
- Start web: `npm run dev --workspace @webrtc/web`

The root `npm test` currently references a nonexistent backend
`test:integration` script. Prefer the three workspace test commands until that
root script is repaired.

## Architecture

The API creates and manages temporary rooms, while media remains peer-to-peer
between browsers. Room and signaling contracts are centralized in
`packages/contracts/src/` and validated with Zod.

- The NestJS application bootstrap, global validation, CORS, and module wiring
  live in `backend/src/main.ts` and `backend/src/app.module.ts`.
- Room HTTP handling follows controller -> service -> repository boundaries.
  `RoomsService` owns room lifecycle and invite verification;
  `RoomsRepository` translates that logic to Prisma operations.
- `PrismaService` owns database connection lifecycle. `schema.prisma` currently
  defines the room status and metadata model. Migrations are not committed
  yet.
- `RoomExpiryScheduler` marks expired waiting rooms once per minute.
- `IceConfigController` exposes validated ICE server configuration read from
  `ICE_SERVERS_JSON`; credentials must stay out of the browser bundle.
- The Next.js app currently has the scaffold landing page in
  `frontend/src/app/page.tsx`. Browser-only WebRTC, signaling, and media
  lifecycle code should live in client modules under `frontend/src/`, not in
  server-rendered modules.
- Signaling data includes offer, answer, ICE candidate, call-end, join, leave,
  room errors, and acknowledgement shapes in
  `packages/contracts/src/signaling.ts`.

## Conventions

- Backend imports are ESM and include explicit `.js` extensions, matching the
  TypeScript/Nest runtime conventions.
- Vitest is used by backend, frontend, and contracts tests. Use `vi.fn()` and
  `vi.mock()` rather than Jest APIs.
- Use strict Nest `ValidationPipe` behavior for REST input:
  `whitelist: true`, `forbidNonWhitelisted: true`, and `transform: true`.
- Use shared Zod schemas and inferred types at REST and signaling boundaries.
  Do not replace unknown payloads with `any`.
- Reuse `@webrtc/contracts` in both applications instead of duplicating room
  or signaling shapes.
- Keep database queries behind `RoomsRepository` or another data-access
  boundary. Controllers and gateways should not query Prisma directly.
- Room lifecycle operations are `WAITING`, `ACTIVE`, `CLOSED`, and `EXPIRED`.
  Invite secrets are random, high-entropy bearer capabilities; only their hash
  is persisted.
- Do not log invite secrets, SDP, ICE candidates, tokens, or media payloads.
- Browser peers must be cleaned up by stopping tracks, closing
  `RTCPeerConnection`, removing listeners, and clearing timers. Cleanup should
  be idempotent.
- The first deployment is a single instance. Do not assume multi-instance
  signaling routing, media relay, or SFU behavior without a feature design.
