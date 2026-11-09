# WebRTC Learning MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a web-first learning MVP where two anonymous browsers can make a temporary peer-to-peer audio/video call using a shared link.

**Architecture:** A Next.js client uses REST to create rooms and a NestJS Socket.IO gateway to exchange validated WebRTC signaling. PostgreSQL/Prisma stores temporary room metadata; browsers send media directly through `RTCPeerConnection`. A shared, runtime-validated contract package keeps the API and signaling protocol independent of the web client for a later mobile client.

**Tech Stack:** TypeScript, npm workspaces, Next.js, NestJS, Socket.IO, PostgreSQL, Prisma, Zod, Jest, Vitest/Testing Library, Playwright.

**Spec:** [docs/superpowers/specs/2026-11-08-webrtc-learning-mvp-design.md](../specs/2026-11-08-webrtc-learning-mvp-design.md)

## Global Constraints

- The current `backend/` directory contains dependency configuration but no application source. Replace its Express/Mongoose scaffold with the NestJS service; there is no existing runtime behavior to migrate.
- The web client is Next.js with TypeScript; browser media and peer-connection APIs live only in client-side modules/components.
- The API and signaling service is NestJS with TypeScript; REST handles room creation and lifecycle operations, and a WebSocket gateway relays signaling.
- PostgreSQL stores temporary room metadata; Prisma provides typed data access and schema migrations.
- Native browser `RTCPeerConnection` sends audio/video directly between browsers; the NestJS service does not relay or store media.
- A local/demo configuration may use STUN; TURN availability and production operation must be addressed before production deployment.
- The first deployment is one NestJS instance. Multi-instance socket routing and an SFU are not MVP requirements.
- A room admits at most two anonymous participants. The reconnect grace period is 60 seconds; an unjoined waiting room has a configurable 30-minute lifetime.
- Do not persist accounts, media, SDP, or ICE candidates. Do not log invite secrets or signaling payloads.
- Validate all REST and signaling input, enforce room membership at the service boundary, and configure allowed web origins explicitly.
- On call teardown, stop local tracks, close the peer connection, remove listeners, and clear timers; teardown must be idempotent.

## Review Focus

- Concurrent joins when only one participant slot remains: exactly one competing participant may occupy the slot; test in Task 5.
- A room reaching its expiry boundary during join: reject it rather than admitting a stale invite; test in Task 4.
- PostgreSQL unavailable during room creation: return an explicit failure, never a successful-looking invite; test in Task 4.
- A participant replaying a message ID or sending from the wrong room: deduplicate or reject it without relaying to another room; test in Task 5.
- Missing/denied browser media permissions or unsupported media APIs: show a useful error and release any acquired tracks; test in Tasks 7 and 9.

---

## File map

| Path                                                                         | Responsibility                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `package.json`                                                               | Root npm workspace declaration and shared build/test scripts.                                                      |
| `backend/package.json`                                                       | NestJS, Prisma, validation, and backend test/build scripts; removes unused Express/Mongoose scaffold dependencies. |
| `backend/src/main.ts`, `backend/src/app.module.ts`                           | Nest bootstrap, validation, CORS, and feature module composition.                                                  |
| `backend/src/prisma/`                                                        | Prisma module/service and database lifecycle.                                                                      |
| `backend/prisma/schema.prisma`, `backend/prisma/migrations/`                 | PostgreSQL room schema and migrations.                                                                             |
| `backend/src/rooms/`                                                         | Room controller, DTOs, service, repository, lifecycle errors, and unit/integration tests.                          |
| `backend/src/rooms/room-expiry.scheduler.ts`                                 | Periodically marks unjoined waiting rooms expired using the repository boundary.                                   |
| `backend/src/ice/`                                                           | Runtime ICE-server configuration endpoint and validation.                                                          |
| `backend/src/signaling/`                                                     | Socket.IO gateway, in-memory participant/reconnect state, and gateway tests.                                       |
| `packages/contracts/`                                                        | Browser/server shared Zod schemas and inferred TypeScript types for room and signaling messages.                   |
| `frontend/package.json`, `frontend/next.config.ts`, `frontend/tsconfig.json` | Next.js app configuration within the workspace.                                                                    |
| `frontend/src/app/page.tsx`                                                  | Create-room landing page.                                                                                          |
| `frontend/src/app/call/[roomId]/page.tsx`                                    | Client-only room route and browser entry point.                                                                    |
| `frontend/src/components/`                                                   | Call screen, status/error display, local/remote video, and controls.                                               |
| `frontend/src/lib/api/rooms.ts`                                              | Typed REST room creation and invite URL creation.                                                                  |
| `frontend/src/lib/signaling/`                                                | Socket.IO client and typed room event handling.                                                                    |
| `frontend/src/lib/webrtc/peer-session.ts`                                    | Browser media acquisition, `RTCPeerConnection` negotiation, controls, and cleanup.                                 |
| `frontend/src/hooks/use-call-session.ts`                                     | UI-facing call state machine coordinating room, signaling, media, and reconnect.                                   |
| `frontend/src/**/*.test.ts(x)`                                               | Focused client unit/component tests.                                                                               |
| `tests/e2e/`, `playwright.config.ts`                                         | Two-browser Playwright call scenarios and local test server setup.                                                 |
| `compose.yaml`                                                               | Local PostgreSQL for development and integration tests.                                                            |
| `backend/.env.example`, `frontend/.env.example`                              | Non-secret local configuration examples.                                                                           |
| `README.md`                                                                  | Setup, local run instructions, limitations, and verification commands.                                             |

## Task 1: Create the workspace and runnable app skeleton

**Files:**

- Create: `package.json`, `compose.yaml`
- Modify: `backend/package.json`
- Delete: `backend/package-lock.json` (replace it with the root workspace lockfile)
- Create: `backend/nest-cli.json`, `backend/tsconfig.json`, `backend/tsconfig.build.json`, `backend/src/main.ts`, `backend/src/app.module.ts`
- Create: `frontend/package.json`, `frontend/next.config.ts`, `frontend/tsconfig.json`, `frontend/src/app/layout.tsx`, `frontend/src/app/page.tsx`
- Create: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/src/index.ts`
- Test: workspace build/typecheck scripts

**Interfaces:**

- Consumes: the existing `backend/` package directory and TypeScript tooling.
- Produces: npm workspaces `@webrtc/api`, `@webrtc/web`, and `@webrtc/contracts`; `npm run build`, `npm test`, `npm run lint`; Nest listens on `PORT` (default `3001`), Next runs on `3000`.

- [ ] **Step 1: Define the root workspace and scripts**

Create a private root `package.json` with workspaces for the three packages and scripts that invoke each workspace's build, test, and lint commands. Keep app-specific dependencies in their app manifests.

```json
{
  "name": "webrtc-learning",
  "private": true,
  "workspaces": ["packages/contracts", "backend", "frontend"],
  "scripts": {
    "build": "npm run build --workspace @webrtc/contracts && npm run build --workspace @webrtc/api && npm run build --workspace @webrtc/web",
    "test": "npm test --workspace @webrtc/contracts && npm test --workspace @webrtc/api && npm run test:integration --workspace @webrtc/api && npm test --workspace @webrtc/web",
    "lint": "npm run lint --workspaces --if-present"
  }
}
```

- [ ] **Step 2: Replace the dependency-only backend scaffold with a Nest app skeleton**

Update `backend/package.json` to `@webrtc/api`, remove unused Express/Mongoose/Joi/JWT dependencies, and add Nest core/config/platform/socket/schedule dependencies, Prisma, class validation, Nest/Jest tooling, and a `pretest` script that builds `@webrtc/contracts`. Add a `main.ts` that loads environment configuration, enables strict global validation, explicitly configures the web origin, and listens on `PORT` or `3001`; add an empty `AppModule`. Configure `test:integration` as a separate Jest project using a real `DATABASE_URL`.

```ts
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000" });
  await app.listen(Number(process.env.PORT ?? 3001));
}
```

Use the scripts `build: nest build`, `start:dev: nest start --watch`, `test: jest --runInBand`, `test:integration: jest --config test/jest-integration.json --runInBand`, `db:generate: prisma generate --schema prisma/schema.prisma`, and `db:migrate: prisma migrate dev --schema prisma/schema.prisma`.

- [ ] **Step 3: Scaffold the Next.js app and contracts workspace**

Create the `@webrtc/web` app with the Next.js App Router and TypeScript. Configure Vitest, jsdom, Testing Library, `socket.io-client`, and a `pretest` script that builds `@webrtc/contracts`. Give each workspace version `1.0.0`; declare `@webrtc/contracts: 1.0.0` as a dependency in both app manifests. Create `@webrtc/contracts` as a TypeScript package with Zod, Vitest, build, test, and declaration output scripts. Export the contracts package from `dist` so Nest and Next consume the same built module. Keep the starter page static until the call tasks.

- [ ] **Step 4: Add local PostgreSQL**

Add a PostgreSQL service to `compose.yaml` with a named volume, health check, and development-only port `5432`. Add `backend/.env.example` with `DATABASE_URL`, `WEB_ORIGIN`, `ROOM_TTL_SECONDS=1800`, `RECONNECT_GRACE_SECONDS=60`, and `ICE_SERVERS_JSON` set to a public STUN-only JSON array. Add a validated runtime ICE-configuration endpoint that reads `ICE_SERVERS_JSON`; do not bake credentials into the Next.js bundle. Add `frontend/.env.example` with `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SIGNALING_URL`; include no credentials that are valid outside local development.

- [ ] **Step 5: Install workspace dependencies and verify app skeletons**

Run `npm install` from the repository root to generate the root lockfile. Start PostgreSQL, then run each app's build and lint scripts.

Run: `docker compose up -d postgres`
Expected: PostgreSQL reports healthy.

Run: `npm install`
Expected: npm generates one root lockfile and links all three workspaces.

Run: `npm run build`
Expected: all three workspaces build without TypeScript errors.

Run: `npm run lint`
Expected: all configured workspace linters pass.

- [ ] **Step 6: Commit the runnable skeleton**

```text
git add package.json package-lock.json backend frontend packages compose.yaml
git commit -m "build: scaffold WebRTC app workspaces"
```

## Task 2: Define shared room and signaling contracts

**Files:**

- Create: `packages/contracts/src/room.ts`, `packages/contracts/src/signaling.ts`, `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/__tests__/room.test.ts`, `packages/contracts/src/__tests__/signaling.test.ts`
- Modify: `packages/contracts/package.json`

**Interfaces:**

- Consumes: `@webrtc/contracts` from Task 1.
- Produces: `CreateRoomResponse`, `JoinRoomRequest`, `RoomErrorCode`, `IceServerConfig`, `ClientSignal`, `ServerSignal`, `SignalAck`, `ClientSignalSchema`, `ServerSignalSchema`, and `SignalAckSchema`; both API and browser use the same runtime schemas.

- [ ] **Step 1: Write failing schema tests**

Test a valid room response, a valid offer envelope, valid and invalid `SignalAck` objects, missing required IDs, an unknown signal type, an invalid ICE candidate shape, an unknown object property, and mismatched type/payload pairs such as `offer` with an ICE candidate.

```ts
it("rejects unknown signaling types and extra fields", () => {
  expect(
    ClientSignalSchema.safeParse({
      type: "future",
      id: crypto.randomUUID(),
      roomId: crypto.randomUUID(),
      payload: {},
    }).success,
  ).toBe(false);
  expect(
    ClientSignalSchema.safeParse({
      type: "endCall",
      id: crypto.randomUUID(),
      roomId: crypto.randomUUID(),
      payload: {},
      senderId: "spoofed",
    }).success,
  ).toBe(false);
});
```

- [ ] **Step 2: Run the contract tests and verify failure**

Run: `npm test --workspace @webrtc/contracts -- --run`
Expected: FAIL because the schemas have not been exported.

- [ ] **Step 3: Implement strict Zod schemas**

Define `CreateRoomResponse` as UUID `roomId`, string `inviteSecret`, and ISO `expiresAt`. Define `JoinRoomRequest` with UUID `roomId`, a 43-character-or-longer invite secret, and an optional session participant credential. Define `RoomErrorCode` as `ROOM_NOT_FOUND | ROOM_EXPIRED | ROOM_FULL | NOT_AUTHORIZED | INVALID_MESSAGE`. Define a discriminated signal union for `offer`, `answer`, `iceCandidate`, and `endCall`; each envelope has UUID `id` and `roomId`. Do not include a client-controlled sender or recipient ID.

```ts
const base = { id: z.string().uuid(), roomId: z.string().uuid() };
const description = z.object({ sdp: z.string().min(1) }).strict();
const candidate = z
  .object({
    candidate: z.string(),
    sdpMid: z.string().nullable(),
    sdpMLineIndex: z.number().int().nullable(),
  })
  .strict();
const empty = z.object({}).strict();

export const ClientSignalSchema = z.discriminatedUnion("type", [
  z
    .object({ ...base, type: z.literal("offer"), payload: description })
    .strict(),
  z
    .object({ ...base, type: z.literal("answer"), payload: description })
    .strict(),
  z
    .object({ ...base, type: z.literal("iceCandidate"), payload: candidate })
    .strict(),
  z.object({ ...base, type: z.literal("endCall"), payload: empty }).strict(),
]);
```

Define `IceServerConfigSchema` for arrays of `{ urls: string | string[], username?: string, credential?: string }`. Define `ServerSignalSchema` with `joined { participantCredential, offerer }`, `peerJoined`, `peerRejoined { offerer }`, `signal { message: ClientSignal }`, `peerLeft`, `roomClosed { reason }`, and `roomError { code: RoomErrorCode }`. Define `SignalAckSchema` as a strict object `{ messageId: UUID, accepted: boolean }`; `accepted` is true for a first delivery and an identical duplicate, and false for a rejected or undeliverable signal. Export inferred types from the package entry point.

- [ ] **Step 4: Run the contract tests**

Run: `npm test --workspace @webrtc/contracts -- --run`
Expected: PASS for valid messages and all malformed/unknown cases.

- [ ] **Step 5: Commit the signaling contract**

```text
git add packages/contracts
git commit -m "feat: define shared WebRTC signaling contracts"
```

## Task 3: Add PostgreSQL room persistence

**Files:**

- Create: `backend/prisma/schema.prisma`, `backend/src/prisma/prisma.module.ts`, `backend/src/prisma/prisma.service.ts`
- Create: `backend/src/rooms/rooms.repository.ts`, `backend/src/rooms/rooms.repository.spec.ts`, `backend/src/rooms/rooms.repository.integration.spec.ts`
- Modify: `backend/src/app.module.ts`, `backend/package.json`

**Interfaces:**

- Consumes: PostgreSQL and Prisma configuration from Task 1.
- Produces: `RoomsRepository.create(input)`, `findById(id)`, `activate(id)`, `close(id, status)`, `markExpired(id)`, `expireWaitingRooms(now)`, and `closeAllActive()`; a `Room` row stores only ID, invite-secret hash, lifecycle status, timestamps, and expiry.

- [ ] **Step 1: Write repository behavior tests**

Use an injected Prisma client mock to assert room creation, lookup by ID, activation, and idempotent close. Assert that repository inputs contain only the hashed invite secret and room metadata—not SDP, ICE, media, or account fields.

```ts
it("persists only temporary room metadata", async () => {
  await repository.create({ id: roomId, inviteSecretHash, expiresAt });
  expect(prisma.room.create).toHaveBeenCalledWith({
    data: { id: roomId, inviteSecretHash, status: "WAITING", expiresAt },
  });
});
```

- [ ] **Step 2: Run repository tests and verify failure**

Run: `npm test --workspace @webrtc/api -- rooms.repository.spec.ts --runInBand`
Expected: FAIL because the repository and Prisma provider are not implemented.

- [ ] **Step 3: Define the Prisma room schema**

Create a `RoomStatus` enum with `WAITING`, `ACTIVE`, `CLOSED`, and `EXPIRED`; create a `Room` model with UUID ID, unique invite-secret hash, status, `createdAt`, `expiresAt`, and nullable `closedAt`. Add the Prisma service's connect/disconnect lifecycle and repository methods. `closeAllActive()` updates active rooms to `CLOSED` with `closedAt=now`; `expireWaitingRooms(now)` marks waiting rooms whose expiry is at or before `now` as `EXPIRED`; `markExpired(id)` conditionally updates one waiting room.

```prisma
enum RoomStatus {
  WAITING
  ACTIVE
  CLOSED
  EXPIRED
}

model Room {
  id               String     @id @default(uuid()) @db.Uuid
  inviteSecretHash String     @unique
  status           RoomStatus @default(WAITING)
  createdAt        DateTime   @default(now())
  expiresAt        DateTime
  closedAt         DateTime?
}
```

- [ ] **Step 4: Create and verify the initial migration**

Run Prisma generation and migration against the local PostgreSQL service. Inspect the migration to confirm no participant, media, SDP, or ICE table was introduced.

Run: `npm run db:generate --workspace @webrtc/api`
Expected: the generated client exposes `Room` and `RoomStatus`.

Run: `npm run db:migrate --workspace @webrtc/api -- --name create_rooms`
Expected: migration succeeds against local PostgreSQL.

- [ ] **Step 5: Run repository tests and database checks**

Run: `npm test --workspace @webrtc/api -- rooms.repository.spec.ts --runInBand`
Expected: repository unit tests pass with Prisma mock calls verified.

Run: `npm run test:integration --workspace @webrtc/api`
Expected: integration tests create/read/close a room against local PostgreSQL.

- [ ] **Step 6: Commit persistence**

```text
git add backend/prisma backend/src/prisma backend/src/rooms/rooms.repository.ts backend/src/rooms/rooms.repository.spec.ts backend/package.json package-lock.json
git commit -m "feat: persist temporary call rooms in PostgreSQL"
```

## Task 4: Implement room creation and lifecycle service

**Files:**

- Create: `backend/src/rooms/dto/create-room.dto.ts`, `backend/src/rooms/rooms.controller.ts`, `backend/src/rooms/rooms.service.ts`, `backend/src/rooms/rooms.module.ts`, `backend/src/rooms/room-expiry.scheduler.ts`, `backend/src/rooms/rooms.service.spec.ts`, `backend/src/rooms/rooms.controller.spec.ts`, `backend/src/rooms/room-expiry.scheduler.spec.ts`
- Create: `backend/src/ice/ice-config.controller.ts`, `backend/src/ice/ice-config.service.ts`, `backend/src/ice/ice-config.module.ts`, `backend/src/ice/ice-config.service.spec.ts`, `backend/src/ice/ice-config.controller.spec.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**

- Consumes: `RoomsRepository` from Task 3 and shared room response types from Task 2.
- Produces: `RoomsService.createRoom(): Promise<CreateRoomResponse>`, `verifyInvite(roomId, secret): Promise<Room>`, `activateRoom(roomId): Promise<void>`, and `closeRoom(roomId, status): Promise<void>`; `RoomExpiryScheduler.expireWaitingRooms(): Promise<void>` runs once per minute and calls `RoomsRepository.expireWaitingRooms(now)`; `IceConfigService.getIceServers(): IceServerConfig`; startup closes rooms left `ACTIVE` by a previous process; `POST /rooms` returns a one-time plaintext invite secret only in the creation response.

- [ ] **Step 1: Write service tests for secret generation, room expiry, and persistence failure**

Use a mocked repository and fixed clock. Assert a 32-byte cryptographically generated secret is returned once, only its SHA-256 hash is persisted, expiry is read from `ROOM_TTL_SECONDS` (default 1800), the exact expiry boundary is rejected and marked `EXPIRED`, active rooms are closed at process startup, and a repository failure propagates as a service error without returning an invite.

```ts
it("rejects an invite at the expiry boundary", async () => {
  clock.setSystemTime(new Date("2026-11-08T06:30:00Z"));
  repository.findById.mockResolvedValue({
    ...room,
    status: "WAITING",
    expiresAt: new Date("2026-11-08T06:30:00Z"),
  });
  await expect(
    service.verifyInvite(room.id, inviteSecret),
  ).rejects.toMatchObject({ code: "ROOM_EXPIRED" });
});
```

- [ ] **Step 2: Run service tests and verify failure**

Run: `npm test --workspace @webrtc/api -- rooms.service.spec.ts --runInBand`
Expected: FAIL because the room service is not implemented.

- [ ] **Step 3: Implement room service and repository lifecycle operations**

Generate the invite secret with `randomBytes(32).toString('base64url')`, persist only `createHash('sha256').update(secret).digest('hex')`, and compare the stored hash with `timingSafeEqual` after verifying equal buffer lengths. Create a waiting room with configurable `ROOM_TTL_SECONDS` (default 1800). Reject missing, closed, and expired rooms with stable error codes; mark expired rooms `EXPIRED`, activate and close rooms through the repository, and use `OnModuleInit` to mark rooms left `ACTIVE` by a server restart as `CLOSED`.

- [ ] **Step 4: Add the REST controller**

Add `POST /rooms` with a strict empty request DTO, returning `{ roomId, inviteSecret, expiresAt }`. Return database and validation failures as explicit non-2xx errors; never return a success response with empty room fields.

- [ ] **Step 5: Expire unjoined rooms on schedule**

Register `ScheduleModule.forRoot()` once in `AppModule`. Implement `RoomExpiryScheduler.expireWaitingRooms()` with `@Cron(CronExpression.EVERY_MINUTE)` and inject `RoomsRepository`; pass the current time to `expireWaitingRooms(now)`. Keep `verifyInvite()`'s expiry-boundary check as the authoritative join guard so correctness does not depend on scheduler timing.

Test that the scheduler calls the repository with the current time and propagates repository failures. Test that a room at its expiry boundary is rejected even when the scheduled job has not run.

Run: `npm test --workspace @webrtc/api -- room-expiry.scheduler.spec.ts rooms.service.spec.ts --runInBand`
Expected: scheduler and expiry-boundary tests pass.

- [ ] **Step 6: Add runtime ICE configuration**

Parse and validate `ICE_SERVERS_JSON` in `IceConfigService` with `IceServerConfigSchema`. Add `GET /ice-servers` to return the validated runtime config so the frontend does not bake TURN credentials into its bundle. For this MVP, document STUN-only defaults; do not log ICE configuration or pretend static TURN credentials are production-safe.

- [ ] **Step 7: Test API contract and PostgreSQL failure**

Test response shape and status, invalid request rejection, malformed ICE environment config, and mocked repository outage. Add an integration test that creates a real room against PostgreSQL and verifies that the row contains the hash, not the plaintext secret.

Run: `npm test --workspace @webrtc/api -- rooms.service.spec.ts rooms.controller.spec.ts ice-config.service.spec.ts ice-config.controller.spec.ts --runInBand`
Expected: unit and controller tests pass; repository/database outage maps to an explicit server error.

Run: `npm run test:integration --workspace @webrtc/api`
Expected: a room created through the real repository stores only the invite-secret hash.

- [ ] **Step 8: Commit room creation**

```text
git add backend/src/rooms backend/src/app.module.ts packages/contracts
git commit -m "feat: create and validate temporary call rooms"
```

## Task 5: Implement validated Socket.IO signaling and reconnect

**Files:**

- Create: `backend/src/signaling/signaling.module.ts`, `backend/src/signaling/signaling.gateway.ts`, `backend/src/signaling/room-presence.ts`, `backend/src/signaling/signaling.gateway.spec.ts`
- Modify: `backend/src/app.module.ts`, `backend/src/rooms/rooms.service.ts`

**Interfaces:**

- Consumes: `RoomsService.verifyInvite/activateRoom/closeRoom` and shared `JoinRoomRequest`, `ClientSignal`, and `ServerSignal` types.
- Produces: `RoomGateway` events `joinRoom`, `signal`, and `leaveRoom`; emits `joined`, `peerJoined`, `peerRejoined`, `signal`, `peerLeft`, `roomClosed`, and `roomError`. The `signal` event accepts a Socket.IO acknowledgment callback returning `SignalAck`; presence is limited to two slots and reserves a disconnected slot for 60 seconds.

- [ ] **Step 1: Write gateway tests for authorization, capacity, and cross-room rejection**

Cover invalid invite, unknown/expired room, a third participant, a signal with an unjoined room ID, a client-supplied sender field, and a conflicting payload that reuses a message ID. Assert invalid messages are not emitted to any socket.

```ts
it("admits only one of two concurrent third-party join attempts", async () => {
  await Promise.all([
    gateway.joinRoom(socketC, validJoin),
    gateway.joinRoom(socketD, validJoin),
  ]);
  expect(
    [socketC, socketD].filter((socket) => socket.received("joined")),
  ).toHaveLength(1);
  expect(
    [socketC, socketD].filter((socket) => socket.received("roomError")),
  ).toHaveLength(1);
});
```

- [ ] **Step 2: Run gateway tests and verify failure**

Run: `npm test --workspace @webrtc/api -- signaling.gateway.spec.ts --runInBand`
Expected: FAIL because the gateway and presence tracker do not exist.

- [ ] **Step 3: Implement room admission and identity**

Validate `JoinRoomRequest` using the shared schema. Store at most two participant slots per room in memory. On initial admission, issue a random participant credential and return it only to that socket; require it to reclaim a reserved slot after a reconnect. Preserve each slot's original order so the first participant remains the offerer after refresh. Derive sender identity from the socket's membership, not message content.

Configure the gateway CORS allowlist from `WEB_ORIGIN`; do not accept arbitrary origins.

- [ ] **Step 4: Implement validated, acknowledged, idempotent signaling**

Validate every signal with `ClientSignalSchema`, require matching room membership, and relay only to the other admitted participant. Acknowledge with `SignalAck` after validation and relay; cache each `(participant slot, message ID, payload hash)` per active room so an identical retry is acknowledged but not relayed twice and reuse of the same ID with different content is rejected with `accepted: false`. Return explicit `ROOM_NOT_FOUND`, `ROOM_EXPIRED`, `ROOM_FULL`, `NOT_AUTHORIZED`, or `INVALID_MESSAGE` errors through `roomError`.

- [ ] **Step 5: Implement leave, reconnect grace, and cleanup**

On transient disconnect, notify the peer, reserve the participant slot for configurable `RECONNECT_GRACE_SECONDS` (default 60), and start one timer. On same-participant rejoin, cancel the timer and notify the designated offerer to renegotiate. An explicit `leaveRoom` or `endCall` closes the room immediately; transport disconnect alone starts the grace timer. On expiry or explicit end-call, close the room, notify all present sockets, clear timers, and delete in-memory membership/deduplication state. Make cleanup safe to call more than once.

- [ ] **Step 6: Test concurrent joins, duplicate messages, and reconnect timer behavior**

Use fake timers and parallel join attempts to prove only one third-party socket can be admitted, an identical duplicate ID is acknowledged and relayed once, a conflicting duplicate is rejected, the correct participant can reclaim within 60 seconds, the first participant remains the offerer after reconnect, and an expired reservation closes the room. Include a room-ID spoof test and assert every failure produces an explicit acknowledgment or `roomError`, never a silent drop.

Run: `npm test --workspace @webrtc/api -- signaling.gateway.spec.ts --runInBand`
Expected: PASS for both normal and adversarial signaling cases.

- [ ] **Step 7: Commit signaling**

```text
git add backend/src/signaling backend/src/rooms/rooms.service.ts backend/src/app.module.ts
git commit -m "feat: relay authorized WebRTC signaling"
```

## Task 6: Build the web room-entry and call-screen shell

**Files:**

- Create: `frontend/src/app/call/[roomId]/page.tsx`, `frontend/src/components/create-room-button.tsx`, `frontend/src/components/call-client.tsx`, `frontend/src/components/call-status.tsx`, `frontend/src/lib/api/rooms.ts`, `frontend/src/lib/api/rooms.test.ts`
- Modify: `frontend/src/app/page.tsx`, `frontend/src/app/globals.css`, `frontend/.env.example`

**Interfaces:**

- Consumes: `POST /rooms` from Task 4 and `CreateRoomResponse` from `@webrtc/contracts`.
- Produces: `createRoom(): Promise<CreateRoomResponse>` and `createInviteUrl(roomId, inviteSecret, origin): string`; a client-only call route receives `roomId` and reads the invite secret from the URL fragment.

- [ ] **Step 1: Test room API client behavior**

Test that `createRoom` sends `POST` to `NEXT_PUBLIC_API_URL/rooms`, parses a valid response, and throws an explicit error on non-2xx or malformed JSON.

```ts
it("does not return a room when the API fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
  );
  await expect(createRoom()).rejects.toThrow("ROOM_CREATE_FAILED");
});
```

- [ ] **Step 2: Implement the room API and invite link helper**

Use the shared response schema to validate the response. Build links as `/call/{roomId}#{inviteSecret}` so the invite secret is not sent in the HTTP request or Referer header.

- [ ] **Step 3: Add the create-room and call-route UI**

Create a landing page with a disabled/loading create button and explicit creation errors. The call route must render a client component and must not access `window`, media APIs, or `RTCPeerConnection` during server rendering. If the fragment is absent, show an actionable invalid-link state.

- [ ] **Step 4: Run frontend tests and build**

Run: `npm test --workspace @webrtc/web -- --run`
Expected: room API tests pass.

Run: `npm run build --workspace @webrtc/web`
Expected: Next.js builds without browser-global/SSR errors.

- [ ] **Step 5: Commit the room-entry shell**

```text
git add frontend
git commit -m "feat: add WebRTC room entry pages"
```

## Task 7: Implement browser media and peer-session lifecycle

**Files:**

- Create: `frontend/src/lib/webrtc/peer-session.ts`, `frontend/src/lib/webrtc/peer-session.test.ts`, `frontend/src/lib/webrtc/media.ts`
- Modify: `frontend/package.json`

**Interfaces:**

- Consumes: shared `ClientSignal` and `ServerSignal` types from Task 2.
- Produces: `createPeerSession(options): Promise<PeerSession>`; `PeerSession` exposes `localStream`, `startOffer()`, `receive(signal: NegotiationSignal)`, `setMicrophoneEnabled(enabled)`, `setCameraEnabled(enabled)`, and idempotent `close()`. `NegotiationSignal` is the shared offer/answer/ICE subset; end-call messages are handled by the call controller.

- [ ] **Step 1: Write peer-session tests with fake media and peer connection**

Test denied permission, unavailable `navigator.mediaDevices`, local stream acquisition, peer-connection construction failure after stream acquisition, offer creation, answer handling, ICE arriving before remote description, mic/camera toggles, remote stream delivery, and repeated cleanup. Verify any acquired tracks stop if a later setup step fails.

```ts
it("stops acquired tracks when peer construction fails", async () => {
  const track = makeFakeTrack();
  mediaDevices.getUserMedia.mockResolvedValue(makeStream(track));
  peerConnectionFactory.mockImplementation(() => {
    throw new Error("PEER_SETUP_FAILED");
  });
  await expect(createPeerSession(options)).rejects.toThrow("PEER_SETUP_FAILED");
  expect(track.stop).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run peer-session tests and verify failure**

Run: `npm test --workspace @webrtc/web -- peer-session.test.ts --run`
Expected: FAIL because the browser media session is not implemented.

- [ ] **Step 3: Implement media acquisition and peer connection**

Call `navigator.mediaDevices.getUserMedia({ audio: true, video: true })` only from a user-initiated client flow. Fetch ICE configuration from `GET /ice-servers`, then create `RTCPeerConnection`; attach local tracks, forward `ontrack` streams, map connection state to a callback, and translate local ICE candidates into typed signaling messages. If peer construction fails after media acquisition, stop those tracks before surfacing the error.

- [ ] **Step 4: Implement offer/answer and ICE ordering**

`startOffer()` creates and sets the local offer before signaling it. Receiving an offer sets the remote description, drains queued candidates, creates/sets the answer, then signals it. Receiving an answer sets the remote description and drains candidates. Queue candidates until a remote description exists.

- [ ] **Step 5: Implement controls and teardown**

Toggle `MediaStreamTrack.enabled` without renegotiating. Make `close()` stop every local track, close the peer connection, clear queued candidates, and release handlers; repeated calls must have no adverse effect.

- [ ] **Step 6: Run peer-session tests**

Run: `npm test --workspace @webrtc/web -- peer-session.test.ts --run`
Expected: PASS for success, denied permissions, early ICE, toggles, and cleanup.

- [ ] **Step 7: Commit peer media**

```text
git add frontend/src/lib/webrtc frontend/package.json
git commit -m "feat: add browser WebRTC peer session"
```

## Task 8: Connect room signaling to the call UI

**Files:**

- Create: `frontend/src/lib/signaling/socket-client.ts`, `frontend/src/hooks/use-call-session.ts`, `frontend/src/components/call-controls.tsx`, `frontend/src/components/video-stage.tsx`, `frontend/src/hooks/use-call-session.test.tsx`
- Modify: `frontend/src/components/call-client.tsx`, `frontend/src/components/call-status.tsx`

**Interfaces:**

- Consumes: NestJS Socket.IO events from Task 5 and `createPeerSession` from Task 7.
- Produces: `useCallSession({ roomId, inviteSecret })` with states `joining`, `requestingMedia`, `waiting`, `connecting`, `connected`, `reconnecting`, `ended`, and `error`; exposes local/remote streams, mute/camera toggles, and `endCall()`. Participant credentials are stored in `sessionStorage` under a room-specific key and reused only for that room in the same tab session.

- [ ] **Step 1: Write hook tests for join state and listener-before-offer ordering**

Use a mock Socket.IO client and peer session. Assert listeners are registered before `joinRoom` is sent, the first participant waits, and the offerer starts negotiation only after `peerJoined`.

```ts
it("registers signal listeners before joining and offers only when designated", async () => {
  const session = renderHook(() => useCallSession({ roomId, inviteSecret }));
  expect(socket.on.mock.invocationCallOrder[0]).toBeLessThan(
    socket.emit.mock.invocationCallOrder[0],
  );
  act(() =>
    socket.serverEmit("joined", { participantCredential, offerer: false }),
  );
  expect(peer.startOffer).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run hook tests and verify failure**

Run: `npm test --workspace @webrtc/web -- use-call-session.test.tsx --run`
Expected: FAIL because the call hook and signaling client do not exist.

- [ ] **Step 3: Implement typed signaling client**

Connect to `NEXT_PUBLIC_SIGNALING_URL`, validate every incoming event and acknowledgment with shared schemas, and send signals with stable message IDs. If an acknowledgment is missing, retry the same message ID up to two times, waiting 500 ms then 1 second; after the third unacknowledged attempt, reject with an explicit delivery error so the call state machine can transition to `error`. Expose explicit server error codes. Never log invite secrets or signaling payloads.

- [ ] **Step 4: Implement the call state machine**

Request media only after the user presses the join action. If permission is denied or media APIs are unavailable, show an actionable error and do not occupy a room slot. Once media is ready, register all signaling listeners before sending `joinRoom`; include the invite secret and any credential from `sessionStorage` key `webrtc:participant:{roomId}`. Save the returned credential under that key. Coordinate offer/answer/ICE messages. On `peerRejoined`, reset the old peer session; only the original first-slot participant (the designated offerer) starts the new offer. On the 60-second timeout or room-close event, transition to a terminal state.

- [ ] **Step 5: Implement the call controls and media stage**

Render local and remote video with `playsInline`, show status/error text, wire mute/camera controls to track enabled state, and make end-call emit once before cleanup. On every terminal state and unmount, close the peer session, disconnect signaling, remove listeners, and clear retry/reconnect timers.

- [ ] **Step 6: Test failure states and cleanup**

Test missing invite fragment, media denial, full/expired room, reconnect within and beyond 60 seconds, socket failure, explicit end, and repeated unmount/cleanup. Verify no local tracks remain live after terminal failure.

Run: `npm test --workspace @webrtc/web -- use-call-session.test.tsx --run`
Expected: PASS for every state transition and cleanup path.

- [ ] **Step 7: Commit integrated call UI**

```text
git add frontend/src
git commit -m "feat: connect browser call UI to signaling"
```

## Task 9: Verify the two-browser call and document local use

**Files:**

- Create: `tests/e2e/webrtc-call.spec.ts`, `playwright.config.ts`
- Modify: `package.json`, `README.md`

**Interfaces:**

- Consumes: working Next.js, NestJS, PostgreSQL, and signaling contract from Tasks 1–8.
- Produces: `npm run test:e2e` that runs the actual room creation/join flow in two browser contexts and a README that reproduces the local demo.

- [ ] **Step 1: Add Playwright test configuration**

Add Playwright as a root development dependency and a root `test:e2e` script. Configure browser launch with `--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream`, set `use.baseURL` to `http://127.0.0.1:3000`, start the API and web server through Playwright `webServer` configuration, and check PostgreSQL readiness before API tests.

- [ ] **Step 2: Write the failing two-browser call test**

Test that browser A creates a room, browser B joins the copied link, both reach connected state, both render a remote video track, mute/camera toggles update UI state, and ending from either browser closes the other side. Add separate invalid/expired invite and camera/microphone-denied tests.

```ts
test("two browsers connect and end the temporary call", async ({ browser }) => {
  const caller = await browser.newContext({
    permissions: ["camera", "microphone"],
  });
  const guest = await browser.newContext({
    permissions: ["camera", "microphone"],
  });
  const callerPage = await caller.newPage();
  const guestPage = await guest.newPage();
  await callerPage.goto("/");
  await callerPage.getByRole("button", { name: "Create call" }).click();
  const inviteUrl = await callerPage
    .getByRole("link", { name: "Copy invite link" })
    .getAttribute("href");
  if (!inviteUrl) throw new Error("INVITE_LINK_MISSING");
  await guestPage.goto(inviteUrl);
  await expect(callerPage.getByTestId("call-status")).toHaveText("Connected");
  await expect(guestPage.getByTestId("call-status")).toHaveText("Connected");
  await expect
    .poll(() =>
      callerPage
        .getByTestId("remote-video")
        .evaluate((video: HTMLVideoElement) => video.videoWidth > 0),
    )
    .toBe(true);
  await callerPage.getByRole("button", { name: "End call" }).click();
  await expect(guestPage.getByTestId("call-status")).toHaveText("Call ended");
  await caller.close();
  await guest.close();
});
```

- [ ] **Step 3: Run the e2e tests and verify failure**

Run: `npm run test:e2e`
Expected: FAIL until the room, signaling, and peer-session flows are integrated.

- [ ] **Step 4: Fix only integration defects and run targeted verification**

Run: `npm test`
Expected: all contract, unit, and integration tests pass.

Run: `npm run lint`
Expected: all workspace linters pass.

Run: `npm run build`
Expected: all workspaces build successfully.

Run: `npm run test:e2e`
Expected: two-browser call and failure-state tests pass. Do not weaken assertions to make a failing flow appear successful.

- [ ] **Step 5: Document setup and known limits**

Update `README.md` with Node/npm prerequisites, `docker compose up -d postgres`, workspace install and migration commands, API/web start commands, browser permissions, local STUN limitations, and the absence of production TURN/multi-instance/group-call support. Verify that `.env` files and secrets remain ignored by the existing root `.gitignore`; modify it only if the generated workspace adds a new build-output directory.

- [ ] **Step 6: Review the final change set and commit**

Run `git diff --check`, then inspect `git status --short` before committing.

```text
git add README.md package.json package-lock.json playwright.config.ts tests/e2e
git commit -m "test: verify WebRTC call flow in two browsers"
```

## Spec coverage self-check

- Next.js client-only boundary and actionable media errors: Tasks 6–8.
- NestJS REST room creation, validation, explicit errors, and service/repository boundary: Tasks 1, 3, and 4.
- PostgreSQL room metadata, Prisma migrations, and persistence failure behavior: Tasks 3–4.
- Two-person room admission, invite capability, scheduled 30-minute waiting expiry, 60-second reconnect, tab-scoped participant credential, and restart behavior: Tasks 4–5 and 8.
- Typed signaling, sender identity, validated acknowledgments, bounded same-ID retries, deduplication, malformed input, and no SDP/ICE persistence: Tasks 2, 5, and 8.
- Direct browser-to-browser media, offer/answer/ICE ordering, controls, teardown: Tasks 7–8.
- Two-browser end-to-end verification, setup documentation, and explicit MVP limitations: Task 9.
