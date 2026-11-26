'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientSignal, RoomErrorCode, ServerSignal } from '@webrtc/contracts';

import {
  createSignalingClient,
  type SignalingClient,
} from '../lib/signaling/socket-client';
import {
  createPeerSession,
  type NegotiationSignal,
  type PeerSession,
} from '../lib/webrtc/peer-session';

export type CallStatusValue =
  | 'joining'
  | 'requestingMedia'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'ended'
  | 'error';

type UseCallSessionOptions = {
  roomId: string;
  inviteSecret: string;
};

const roomErrorMessages: Record<RoomErrorCode, string> = {
  ROOM_NOT_FOUND: 'This room could not be found. Ask the caller for a new invite.',
  ROOM_EXPIRED: 'This room has expired. Ask the caller to create a new room.',
  ROOM_FULL: 'This room already has two participants.',
  NOT_AUTHORIZED: 'This invite is not authorized for this room.',
  INVALID_MESSAGE: 'The room received an invalid signaling message.',
};

function isNegotiationSignal(signal: ClientSignal): signal is NegotiationSignal {
  return signal.type === 'offer' || signal.type === 'answer' || signal.type === 'iceCandidate';
}

export function useCallSession({ roomId, inviteSecret }: UseCallSessionOptions) {
  const [status, setStatus] = useState<CallStatusValue>('waiting');
  const [error, setError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const peerRef = useRef<PeerSession | null>(null);
  const clientRef = useRef<SignalingClient | null>(null);
  const cleanupListenersRef = useRef<Array<() => void>>([]);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectingPeerRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(false);
  const joinedRef = useRef(false);
  const hasConnectedRef = useRef(false);
  const offererRef = useRef(false);
  const joinedBeforeRef = useRef(false);
  const terminalRef = useRef(false);
  const endingRef = useRef(false);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    clearReconnectTimer();
    for (const removeListener of cleanupListenersRef.current.splice(0)) {
      removeListener();
    }
    peerRef.current?.close();
    peerRef.current = null;
    clientRef.current?.disconnect();
    clientRef.current = null;
    if (isMountedRef.current) {
      setLocalStream(null);
      setRemoteStream(null);
    }
  }, [clearReconnectTimer]);

  const fail = useCallback(
    (message: string) => {
      if (terminalRef.current) {
        return;
      }
      terminalRef.current = true;
      setError(message);
      setStatus('error');
      cleanup();
    },
    [cleanup],
  );

  const makePeerSession = useCallback(async () => {
    const peer = await createPeerSession({
      roomId,
      onSignal: async (signal) => {
        const client = clientRef.current;
        if (!client) {
          throw new Error('SIGNALING_UNAVAILABLE');
        }
        await client.sendSignal(signal);
      },
      onRemoteStream: (stream) => setRemoteStream(stream),
      onConnectionStateChange: (connectionState) => {
        if (connectionState === 'connected') {
          clearReconnectTimer();
          setStatus('connected');
        } else if (connectionState === 'failed' || connectionState === 'closed') {
          fail('The peer connection ended. Try joining again.');
        } else if (connectionState === 'disconnected') {
          setStatus('reconnecting');
        }
      },
      onError: (cause) => fail(cause.message),
    });
    if (!isMountedRef.current || terminalRef.current) {
      peer.close();
      return null;
    }
    peerRef.current = peer;
    setLocalStream(peer.localStream);
    return peer;
  }, [clearReconnectTimer, fail, roomId]);

  const join = useCallback(async () => {
    if (peerRef.current || clientRef.current || terminalRef.current) {
      return;
    }
    if (inviteSecret.length < 43) {
      fail('This invite link is incomplete. Ask the caller to share a new link.');
      return;
    }
    setError(null);
    setStatus('requestingMedia');

    try {
      const peer = await makePeerSession();
      if (!peer) {
        return;
      }

      const client = createSignalingClient();
      clientRef.current = client;
      const credentialKey = `webrtc:participant:${roomId}`;
      const participantCredential = sessionStorage.getItem(credentialKey) ?? undefined;
      joinedBeforeRef.current = participantCredential !== undefined;

      const subscribe = (
        event: Parameters<SignalingClient['on']>[0],
        handler: Parameters<SignalingClient['on']>[1],
      ) => {
        cleanupListenersRef.current.push(client.on(event, handler));
      };

      subscribe('joined', (payload) => {
        const signal = payload as Extract<ServerSignal, { type: 'joined' }>;
        joinedRef.current = true;
        offererRef.current = signal.offerer;
        sessionStorage.setItem(credentialKey, signal.participantCredential);
        setStatus('waiting');
        if (joinedBeforeRef.current && signal.offerer) {
          setStatus('connecting');
          void peerRef.current?.startOffer().catch((cause: unknown) => {
            fail(cause instanceof Error ? cause.message : 'SIGNALING_DELIVERY_FAILED');
          });
        }
      });

      subscribe('peerJoined', () => {
        if (!offererRef.current) {
          return;
        }
        setStatus('connecting');
        void peerRef.current?.startOffer().catch((cause: unknown) => {
          fail(cause instanceof Error ? cause.message : 'SIGNALING_DELIVERY_FAILED');
        });
      });

      subscribe('peerRejoined', (payload) => {
        const signal = payload as Extract<ServerSignal, { type: 'peerRejoined' }>;
        clearReconnectTimer();
        setStatus('reconnecting');
        const oldPeer = peerRef.current;
        oldPeer?.close();
        peerRef.current = null;
        setLocalStream(null);
        reconnectingPeerRef.current = makePeerSession()
          .then((peerSession) => {
            if (peerSession && offererRef.current && !signal.offerer) {
              setStatus('connecting');
              return peerSession.startOffer();
            }
          })
          .catch((cause: unknown) => {
            fail(cause instanceof Error ? cause.message : 'PEER_SETUP_FAILED');
          })
          .finally(() => {
            reconnectingPeerRef.current = null;
          });
      });

      subscribe('signal', (payload) => {
        const signal = payload as Extract<ServerSignal, { type: 'signal' }>;
        const message = signal.message;
        if (!isNegotiationSignal(message)) {
          fail('The room received an unsupported signaling message.');
          return;
        }
        void (async () => {
          await reconnectingPeerRef.current;
          const currentPeer = peerRef.current;
          if (!currentPeer) {
            throw new Error('PEER_SESSION_UNAVAILABLE');
          }
          await currentPeer.receive(message);
          setStatus('connecting');
        })().catch((cause: unknown) => {
          fail(cause instanceof Error ? cause.message : 'SIGNALING_DELIVERY_FAILED');
        });
      });

      subscribe('peerLeft', () => {
        setStatus('reconnecting');
        clearReconnectTimer();
        reconnectTimerRef.current = setTimeout(() => {
          fail('The other participant did not reconnect within 60 seconds.');
        }, 60_000);
      });

      subscribe('roomClosed', () => {
        terminalRef.current = true;
        setStatus('ended');
        if (!endingRef.current) {
          cleanup();
        }
      });

      subscribe('roomError', (payload) => {
        const signal = payload as Extract<ServerSignal, { type: 'roomError' }>;
        fail(roomErrorMessages[signal.code]);
      });

      subscribe('error', (payload) => {
        fail(payload instanceof Error ? payload.message : 'SIGNALING_INVALID_MESSAGE');
      });

      subscribe('disconnect', () => {
        if (!joinedRef.current || terminalRef.current) {
          return;
        }
        setStatus('reconnecting');
        clearReconnectTimer();
        reconnectTimerRef.current = setTimeout(() => {
          fail('Could not reconnect to the call within 60 seconds.');
        }, 60_000);
      });

      subscribe('connect', () => {
        if (!hasConnectedRef.current) {
          hasConnectedRef.current = true;
          return;
        }
        if (!joinedRef.current || terminalRef.current) {
          return;
        }
        clearReconnectTimer();
        client.joinRoom({
          roomId,
          inviteSecret,
          participantCredential: sessionStorage.getItem(credentialKey) ?? undefined,
        });
      });

      setStatus('joining');
      await client.connect();
      if (terminalRef.current || !isMountedRef.current) {
        return;
      }
      client.joinRoom({ roomId, inviteSecret, participantCredential });
    } catch (cause) {
      const errorMessage = cause instanceof Error ? cause.message : 'CALL_SETUP_FAILED';
      if (/NotAllowedError|Permission denied/i.test(errorMessage)) {
        fail('Camera and microphone access was denied. Allow access in your browser and try again.');
      } else if (/MEDIA_UNAVAILABLE/i.test(errorMessage)) {
        fail('This browser does not support camera and microphone access.');
      } else {
        fail(errorMessage);
      }
    }
  }, [
    clearReconnectTimer,
    cleanup,
    fail,
    inviteSecret,
    makePeerSession,
    roomId,
  ]);

  const endCall = useCallback(async () => {
    if (endingRef.current || terminalRef.current) {
      return;
    }
    endingRef.current = true;
    terminalRef.current = true;
    setStatus('ended');
    const client = clientRef.current;
    try {
      if (client && joinedRef.current) {
        await client.sendSignal({
          id: crypto.randomUUID(),
          roomId,
          type: 'endCall',
          payload: {},
        });
      }
      cleanup();
    } catch (cause) {
      terminalRef.current = false;
      fail(cause instanceof Error ? cause.message : 'SIGNALING_DELIVERY_FAILED');
    }
  }, [cleanup, fail, roomId]);

  const toggleMicrophone = useCallback(() => {
    const enabled = !microphoneEnabled;
    peerRef.current?.setMicrophoneEnabled(enabled);
    setMicrophoneEnabled(enabled);
  }, [microphoneEnabled]);

  const toggleCamera = useCallback(() => {
    const enabled = !cameraEnabled;
    peerRef.current?.setCameraEnabled(enabled);
    setCameraEnabled(enabled);
  }, [cameraEnabled]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  return {
    status,
    error,
    localStream,
    remoteStream,
    microphoneEnabled,
    cameraEnabled,
    join,
    endCall,
    toggleMicrophone,
    toggleCamera,
  };
}
