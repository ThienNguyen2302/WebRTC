'use client';

import { useEffect, useState } from 'react';

import { CallStatus } from './call-status';

type InviteState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'ready'; secret: string };

type CallClientProps = {
  roomId: string;
};

export function CallClient({ roomId }: CallClientProps) {
  const [invite, setInvite] = useState<InviteState>({ kind: 'loading' });

  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (!fragment) {
      setInvite({ kind: 'invalid' });
      return;
    }

    try {
      const secret = decodeURIComponent(fragment);
      setInvite(secret.length >= 43 ? { kind: 'ready', secret } : { kind: 'invalid' });
    } catch {
      setInvite({ kind: 'invalid' });
    }
  }, []);

  if (invite.kind === 'loading') {
    return <CallStatus message="Loading invite..." status="loading" />;
  }

  if (invite.kind === 'invalid') {
    return (
      <main className="call-shell">
        <h1>Invite link unavailable</h1>
        <CallStatus
          message="This invite link is incomplete. Ask the caller to share a new link."
          status="error"
        />
      </main>
    );
  }

  return (
    <main className="call-shell">
      <p className="eyebrow">Private room</p>
      <h1>Join your call</h1>
      <p>Room ID: {roomId}</p>
      <CallStatus message="Invite ready" status="ready" />
    </main>
  );
}
