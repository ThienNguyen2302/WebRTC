---
name: webrtc-frontend
description: Use when building or changing the frontend of a WebRTC product, especially Next.js pages, browser media, RTCPeerConnection, signaling state, hydration, permissions, retries, or reconnect cleanup.
---

# WebRTC Frontend

## Overview

Keep browser-only WebRTC behavior out of server rendering, model signaling as an explicit asynchronous state machine, and make retries and cleanup idempotent.

## When to Use

- Adding or changing a Next.js page, client component, route handler, or data-fetching path for WebRTC.
- Integrating `RTCPeerConnection`, local media, offers, answers, ICE candidates, or signaling.
- Debugging hydration errors, permission failures, duplicate messages, reconnect loops, or production hangs.

Confirm whether the frontend is actually Next.js and preserve its established conventions. Do not assume a server/client boundary, API base URL, or transport library without inspecting the project.

## Browser and Next.js Boundaries

- Keep `RTCPeerConnection`, `navigator.mediaDevices`, media tracks, and event handlers in client components or dedicated browser modules.
- Never execute browser-only APIs during server rendering.
- Keep privileged database work and secrets on server-side boundaries; never expose secrets in client bundles.
- Validate and type all data crossing server/client or API/WebSocket boundaries.
- Handle hydration mismatches deliberately.
- Give users an actionable state for denied permissions and unsupported browsers.

## Signaling State Machine

Define states and transitions for joining, negotiating, connected, reconnecting, and leaving. Define message IDs, ordering, acknowledgements, retryability, and terminal errors.

- Register listeners before sending offers, answers, or ICE candidates.
- Deduplicate messages and make reconnects idempotent.
- Clear timers after success, failure, unmount, and disconnect.
- Represent loading, empty, retrying, permission-denied, unsupported, and terminal-error states explicitly.
- Do not hide malformed or unknown messages behind a success-shaped fallback.

## Example

```ts
useEffect(() => {
  const onSignal = (message: SignalMessage) => {
    if (seenMessageIds.current.has(message.id)) return;
    seenMessageIds.current.add(message.id);
    dispatch({ type: 'SIGNAL_RECEIVED', message });
  };

  signaling.on('message', onSignal);
  return () => {
    signaling.off('message', onSignal);
    clearTimeout(reconnectTimer.current);
    peerConnection.close();
  };
}, [peerConnection, signaling]);
```

## Production Debugging

Trace one session before increasing timeouts:

1. Correlate browser, signaling, backend, and database events with `sessionId` and message IDs.
2. Compare a successful session with a hanging session.
3. Verify send, delivery, acknowledgement, state transition, and timer cleanup.
4. Check duplicate or reordered messages, reconnect races, instance routing, and schema versions.
5. Reproduce delayed, duplicated, dropped, and out-of-order delivery.
6. Verify the fix with metrics and a browser test or reproducible manual matrix.

## Required Tests

Cover delayed ICE, duplicate and out-of-order messages, peer disconnect, refresh/reconnect, cleanup on unmount, permission denial, unsupported browsers, hydration, loading/error states, and retry exhaustion.

## Common Mistakes

- Running `RTCPeerConnection` or media APIs during server rendering.
- Sending before listeners are registered.
- Retrying without deduplication or leaving timers active after success.
- Treating “works locally” as evidence against race conditions or schema drift.
- Logging SDP, tokens, or media-sensitive payloads unnecessarily.
- Using `any` for signaling messages instead of a discriminated type.

## Red Flags

Stop and inspect the state machine when someone says:

- “Just increase the timeout.”
- “The browser is the problem because it works locally.”
- “Send first; register the listener afterward.”
- “Use `any` now and type it later.”
