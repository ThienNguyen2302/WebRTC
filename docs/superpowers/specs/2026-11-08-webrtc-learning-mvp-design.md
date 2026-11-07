# WebRTC Learning MVP Design

## Purpose and scope

Build a web-first learning application that lets two anonymous people make a
temporary, peer-to-peer audio/video call using a shared invite link. The MVP
includes room creation and joining, local and remote video, microphone and
camera controls, ending a call, and a short reconnect window.

The project is intended to teach the complete browser WebRTC flow, not to
provide a production-scale communications platform. Accounts, text chat, group
calls, mobile clients, multi-instance deployment, and production reliability
work are later phases. The architecture should keep the API and signaling
protocol usable by a future mobile client without building that client now.

## Technology and architecture

- The current `backend/` directory contains dependency configuration but no
  application source. Replace its Express/Mongoose scaffold with the NestJS
  service; there is no existing runtime behavior to migrate.
- **Web client:** Next.js with TypeScript. Browser media and peer-connection
  APIs live only in client-side modules/components.
- **API and signaling:** NestJS with TypeScript. REST endpoints handle room
  creation and lifecycle operations; a WebSocket gateway relays signaling.
- **Database:** PostgreSQL stores temporary room metadata. Prisma provides
  typed data access and schema migrations.
- **Media:** Native browser `RTCPeerConnection` sends audio/video directly
  between the two browsers. The NestJS service does not relay or store media.
- **ICE:** Configure STUN/TURN server entries through environment-based
  settings. A local/demo configuration may use STUN; TURN availability and
  production operation are deferred and must be addressed before production
  deployment.

Keep room use cases behind a NestJS service/repository boundary and keep the
signaling contract independent of Next.js. The first deployment is a single
NestJS instance. Multi-instance socket routing and an SFU are not MVP
requirements.

## Main flows

### Create and join

1. The caller creates a room through the NestJS API.
2. The API creates a waiting room in PostgreSQL and returns a shareable invite
   URL containing a high-entropy secret.
3. Each browser requests camera/microphone access after a user action and
   connects to the signaling gateway.
4. The gateway validates the room capability and admits at most two
   participants. The first participant is the offerer; the second participant
   triggers negotiation.
5. The browsers exchange an offer, answer, and ICE candidates through the
   gateway. The gateway validates and relays messages to the other room
   participant; audio/video flows peer-to-peer.

### End and reconnect

- An explicit end-call action closes the room for both participants and makes
  the invite link unusable.
- A transient transport disconnect reserves that participant's slot for 60
  seconds. The same browser can rejoin using a session-scoped participant
  credential. A refresh/rejoin triggers a fresh peer negotiation; it does not
  pretend that the old peer connection survived the refresh.
- If the reconnect window expires, the room closes. An unjoined waiting room
  expires after a proposed, configurable 30-minute lifetime. This is a design
  default for review, not a user-specified value.
- A server restart invalidates active calls and closes their rooms. The MVP
  does not attempt to restore in-memory socket membership or media connections.

## Signaling contract

Use typed, validated messages with a stable JSON shape. Each message includes
a message ID, room ID, message type, and type-specific payload. The gateway
derives sender identity from the authenticated socket membership rather than
trusting a client-supplied sender ID; the recipient is the other authorized
participant in the room.

The message types cover joining/leaving, peer arrival/rejoin, offer, answer,
ICE candidate, call end, and explicit errors. Socket delivery is ordered. The
sender retries an unacknowledged message with the same message ID; the gateway
acknowledges validated delivery and deduplicates retries for the active room.
SDP and ICE data are transient and are never persisted.

The browser registers listeners before negotiation starts and queues incoming
ICE candidates until the remote description is installed. A room that is
unknown, expired, full, or unauthorized returns an explicit error. Malformed
or unknown messages are rejected rather than ignored.

## Persistence and room security

Persist only the room ID, invite-secret hash, lifecycle status, creation time,
expiry time, and closure time. Live participant/socket membership and the
reconnect timer remain in memory. Do not persist accounts, media, SDP, or ICE
candidates.

Treat the invite URL as a bearer capability. Generate its secret with a
cryptographically secure random source, store only a hash, and avoid logging
invite secrets or signaling payloads. Validate all REST and signaling input,
enforce room membership and the two-participant limit at the service boundary,
and configure allowed web origins explicitly. Secrets and ICE server
credentials belong in environment configuration, not client bundles.

## Client behavior and cleanup

The web experience has a create/join screen and a call screen with local and
remote video, mute, camera toggle, and end-call controls. Represent joining,
media permission, connecting, connected, reconnecting, ended, and error states
explicitly. Permission denial, unsupported media APIs, full/expired rooms, and
connection failures must give actionable feedback.

On leave, terminal failure, or component teardown, stop all local media tracks,
close the peer connection, remove signaling listeners, and clear timers. These
operations must be safe if invoked more than once.

## Verification

- **Unit tests:** room lifecycle transitions, capability checks, capacity,
  expiry, reconnect grace, input validation, and duplicate-message handling.
- **Integration tests:** PostgreSQL migrations and repository/service behavior,
  including database failures and expired/closed room rejection.
- **Browser tests:** two independent browser contexts join a room and negotiate
  a call; exercise mute/camera controls, explicit end, refresh/rejoin, grace
  expiry, permission denial, and cleanup. Use browser media simulation where
  physical devices are unavailable.

The MVP is complete when two browsers can establish a 1:1 call over the
signaling service, see and hear each other where network conditions permit,
use the basic controls, and reliably reach explicit ended/error states with
resources cleaned up.
