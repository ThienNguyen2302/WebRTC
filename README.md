# WebRTC Learning MVP

A browser-first WebRTC learning project. The Next.js client connects to a
NestJS API, uses Socket.IO for signaling, and stores temporary room metadata
in PostgreSQL through Prisma. Browser media is sent peer-to-peer with
`RTCPeerConnection`; the API does not relay media.

## Prerequisites

- Node.js and npm
- Docker with Docker Compose

## Install

From the repository root:

```powers
npm install
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env.local
docker compose up -d postgres
npm exec -- prisma generate --schema backend/prisma/schema.prisma
npm run build --workspace @webrtc/contracts
```

The PostgreSQL service listens on `localhost:5432` and uses:

```text
database: webrtc
user: postgres
password: postgres
```

No Prisma migrations are currently committed. Do not run a migration command
until migrations have been added for the room schema.

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

## Unit tests

Run the currently configured unit-test suites separately:

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

The root `npm test` script currently references a backend
`test:integration` script that is not present, so it is not a runnable
full-suite command yet.

The backend E2E config is present, but the repository is missing a runnable
integration-script definition and browser test suite.

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

## Repository layout

- `frontend/`: Next.js App Router client
- `backend/`: NestJS API, Prisma access, and room lifecycle
- `packages/contracts/`: shared Zod schemas and TypeScript types
- `compose.yaml`: local PostgreSQL configuration
- `docs/superpowers/specs/`: architecture and product design
- `docs/superpowers/plans/`: implementation plan
