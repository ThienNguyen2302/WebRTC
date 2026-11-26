# WebRTC Learning MVP

A browser-first WebRTC learning project. The Next.js client connects to a
NestJS API, uses Socket.IO for signaling, and stores temporary room metadata
in PostgreSQL through Prisma. Browser media is sent peer-to-peer with
`RTCPeerConnection`; the API does not relay media.

## Prerequisites

- Node.js 20.9+ and npm
- Docker with Docker Compose

## Install

From the repository root:

```powers
npm install
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env.local
docker compose up -d postgres
npm exec -- prisma migrate deploy --schema backend/prisma/schema.prisma
npm exec -- prisma generate --schema backend/prisma/schema.prisma
npm run build --workspace @webrtc/contracts
```

The PostgreSQL service listens on `localhost:5432` and uses:

```text
database: webrtc
user: postgres
password: postgres
```

The initial room-schema migration is committed. `migrate deploy` applies it to
the configured database without creating a new migration.

## Start the applications

Build the shared contracts first, then run the API and web app in separate
PowerShell terminals.

Terminal 1:

```powers
npm run start:dev --workspace @webrtc/api
```

The API listens on `http://localhost:3001` by default.

Terminal 2:

```powers
npm run dev --workspace @webrtc/web
```

The web app listens on `http://localhost:3000`.

Stop local PostgreSQL when finished:

```powers
docker compose down
```

## Build

Build every workspace:

```powers
npm run build
```

Build one workspace:

```powers
npm run build --workspace @webrtc/contracts
npm run build --workspace @webrtc/api
npm run build --workspace @webrtc/web
```

## Tests

Run the unit-test suites separately:

```powers
npm test --workspace @webrtc/contracts
npm test --workspace @webrtc/api
npm test --workspace @webrtc/web
```

Run one test file:

```powers
npm test --workspace @webrtc/contracts -- src/__tests__/room.test.ts
npm test --workspace @webrtc/contracts -- src/__tests__/signaling.test.ts
npm test --workspace @webrtc/api -- src/rooms/rooms.service.spec.ts
npm test --workspace @webrtc/api -- src/api.spec.ts
```

Backend watch and coverage modes:

```powers
npm run test:watch --workspace @webrtc/api
npm run test:cov --workspace @webrtc/api
```

The backend integration suite requires a reachable PostgreSQL database set in
`DATABASE_URL` and a migrated schema:

```powershell
npm run test:integration --workspace @webrtc/api
```

### Two-browser Playwright test

The browser suite uses fake camera/microphone devices and needs its own local
database. Create it once:

```powershell
docker compose exec postgres createdb -U postgres webrtc_e2e
$env:E2E_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/webrtc_e2e"
$env:DATABASE_URL = $env:E2E_DATABASE_URL
npm exec -- prisma migrate deploy --schema backend/prisma/schema.prisma
npm run test:e2e
```

The e2e setup refuses databases that are not on localhost or whose name does
not end in `_e2e`. Playwright starts the API and web app automatically. If
Playwright's Chromium browser is not installed yet, install it with
`npx playwright install chromium`.

## Lint

Lint all workspaces that define a lint script:

```powers
npm run lint
```

Lint a single workspace:

```powers
npm run lint --workspace @webrtc/contracts
npm run lint --workspace @webrtc/api
npm run lint --workspace @webrtc/web
```

Browser camera/microphone prompts require user permission in normal browsing.
The Playwright suite uses synthetic media and does not require physical devices.

## Known limitations

- The local ICE example is STUN-only. Calls may fail across restrictive NATs or
  firewalls; configure a production TURN service before relying on calls outside
  a local/demo network.
- Signaling presence is held in memory by one API instance. Multi-instance
  routing and group calls are not supported.
- Rooms are temporary and intended for two anonymous participants. Accounts,
  chat, and media storage are out of scope.

## Repository layout

- `frontend/`: Next.js App Router client
- `backend/`: NestJS API, Prisma access, and room lifecycle
- `packages/contracts/`: shared Zod schemas and TypeScript types
- `compose.yaml`: local PostgreSQL configuration
- `docs/superpowers/specs/`: architecture and product design
- `docs/superpowers/plans/`: implementation plan
