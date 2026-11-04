---
name: webrtc-backend
description: Use when building or changing the backend of a WebRTC product, especially NestJS APIs, PostgreSQL persistence, signaling delivery, authentication, migrations, retries, or production session debugging.
---

# WebRTC Backend

## Overview

Make signaling contracts explicit, enforce session invariants at the persistence boundary, and keep transport handlers thin. Verify the repository's actual stack before applying framework-specific rules; this repository currently contains an Express/Mongoose backend.

## When to Use

- Adding or changing rooms, presence, offers, answers, ICE candidates, reconnects, or signaling transport.
- Adding a NestJS API or PostgreSQL schema.
- Debugging duplicate messages, stale sessions, hangs, schema drift, or failed migrations.

Inspect package manifests, modules, models, migrations, environment configuration, and tests first. If the repository uses Express/Mongoose, preserve those conventions unless the task explicitly includes a stack migration.

## Contract and Persistence

Define `roomId`, sender/receiver identity, message type, payload, sequence or message ID, timestamps, error codes, retryability, and acknowledgement behavior before implementation.

- Use idempotency keys for retried writes and enforce uniqueness in the database.
- Define allowed lifecycle transitions for joining, negotiating, connected, reconnecting, and leaving.
- Use database constraints for room/session invariants, not only application checks.
- Use transactions for multi-row state changes.
- Add migrations for schema changes. Check deployment migration status and verify upgrade/rollback assumptions with the repository's migration tooling; never invent a command or silently skip schema verification.

## NestJS and PostgreSQL

These rules apply only when the target service actually uses NestJS and PostgreSQL:

1. Keep controllers thin: transport parsing, guards, DTO validation, and response mapping.
2. Put use-case orchestration in services and database access behind a repository/data-access boundary.
3. Use DTOs and a global `ValidationPipe` configured to transform and reject unknown fields.
4. Map expected domain failures to explicit HTTP/WebSocket errors.
5. Log unexpected failures with correlation and session IDs; never return success-shaped fallbacks.
6. Test service behavior, repository integration, and API/WebSocket contracts.

For another backend stack, use its equivalent boundary validation, service/data-access separation, error mapping, and migration checks.

```ts
async handleCandidate(input: CandidateDto, actorId: string): Promise<void> {
  const session = await this.sessions.findAuthorized(input.roomId, actorId);
  if (!session) throw new NotFoundException('ROOM_NOT_FOUND');

  await this.db.transaction(async (tx) => {
    await this.candidates.insertIfAbsent(tx, {
      idempotencyKey: input.idempotencyKey,
      roomId: input.roomId,
      senderId: actorId,
      candidate: input.candidate,
    });
  });
}
```

## Production Signaling Hangs

Trace one session before changing retry counts:

1. Correlate browser, transport, service, and database logs with `sessionId` and message IDs.
2. Compare a successful trace with a hanging trace.
3. Verify send, persist, deliver, acknowledge, state transition, and timer cleanup.
4. Check duplicate/reordered messages, reconnect races, instance routing, and schema versions.
5. Reproduce delayed, duplicated, dropped, and out-of-order delivery.
6. Ship the smallest tested fix with metrics, canary/rollback, and an explicit failure mode.

## Required Tests

Cover malformed or unknown input, missing rooms, unauthorized access, duplicate delivery, retries, reconnects, delayed messages, database failures, migration behavior, and cleanup after disconnect.

## Common Mistakes

- Applying NestJS decorators, `ValidationPipe`, SQL, or PostgreSQL migration commands to an Express/Mongoose service.
- Putting queries in controllers.
- Using `any` to hide an unclear signaling payload.
- Retrying non-idempotent writes without a key.
- Increasing timeouts or blaming WebRTC without tracing the missing state transition.
- Logging SDP, tokens, or media-sensitive payloads unnecessarily.

## Red Flags

Stop and inspect the contract when someone says:

- “It is only a demo, skip validation.”
- “The query is small; put it in the controller.”
- “Just retry it again.”
- “Use `any` now and type it later.”
