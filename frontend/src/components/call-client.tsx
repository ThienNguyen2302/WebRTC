'use client';

import { useEffect, useState } from 'react';

import { CallControls } from './call-controls';
import { CallStatus } from './call-status';
import { VideoStage } from './video-stage';
import { useCallSession } from '../hooks/use-call-session';

type InviteState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'ready'; secret: string };

type CallClientProps = {
  roomId: string;
};

export function CallClient({ roomId }: CallClientProps) {
  const [invite, setInvite] = useState<InviteState>({ kind: 'loading' });
  const [started, setStarted] = useState(false);
  const call = useCallSession({
    roomId,
    inviteSecret: invite.kind === 'ready' ? invite.secret : '',
  });

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
      <CallStatus
        message={call.error ?? statusMessages[call.status]}
        status={call.error ? 'error' : call.status}
      />
      {!started && call.status !== 'error' ? (
        <button
          className="primary-button"
          onClick={() => {
            setStarted(true);
            void call.join();
          }}
          type="button"
        >
          Join call
        </button>
      ) : null}
      {started ? (
        <>
          <VideoStage localStream={call.localStream} remoteStream={call.remoteStream} />
          {call.status !== 'ended' && call.status !== 'error' ? (
            <CallControls
              cameraEnabled={call.cameraEnabled}
              microphoneEnabled={call.microphoneEnabled}
              onEndCall={() => void call.endCall()}
              onToggleCamera={call.toggleCamera}
              onToggleMicrophone={call.toggleMicrophone}
            />
          ) : null}
        </>
      ) : null}
    </main>
  );
}

const statusMessages = {
  joining: 'Connecting to the room...',
  requestingMedia: 'Requesting camera and microphone access...',
  waiting: 'Waiting for the other participant...',
  connecting: 'Connecting your call...',
  connected: 'Connected',
  reconnecting: 'Reconnecting to the other participant...',
  ended: 'Call ended',
  error: 'Could not join this call.',
} as const;
