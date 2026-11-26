// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCallSession } from './use-call-session';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (payload?: unknown) => void>();
  const actions: string[] = [];
  const client = {
    on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      actions.push(`on:${event}`);
      handlers.set(event, handler);
      return () => handlers.delete(event);
    }),
    connect: vi.fn(async () => {
      actions.push('connect');
      handlers.get('connect')?.();
    }),
    joinRoom: vi.fn(() => {
      actions.push('joinRoom');
    }),
    sendSignal: vi.fn(async () => ({
      messageId: '0136542e-6cc0-42ec-9f2f-0929c080a96b',
      accepted: true,
    })),
    leaveRoom: vi.fn(),
    disconnect: vi.fn(),
  };
  const peer = {
    localStream: {} as MediaStream,
    startOffer: vi.fn(async () => undefined),
    receive: vi.fn(async () => undefined),
    setMicrophoneEnabled: vi.fn(),
    setCameraEnabled: vi.fn(),
    close: vi.fn(),
  };
  return {
    handlers,
    actions,
    client,
    peer,
    createSignalingClient: vi.fn(() => client),
    createPeerSession: vi.fn(async () => peer),
  };
});

vi.mock('../lib/signaling/socket-client', () => ({
  createSignalingClient: mocks.createSignalingClient,
}));

vi.mock('../lib/webrtc/peer-session', () => ({
  createPeerSession: mocks.createPeerSession,
}));

const roomId = '2d9c6d8a-5c6c-48b8-b4fa-dc3ccdb88a2d';
const inviteSecret = 'a'.repeat(43);
const participantCredential = 'participant-session-secret';
const mountedRoots = new Set<() => void>();

function renderHook<T>(callback: () => T) {
  let current!: T;
  function TestComponent() {
    current = callback();
    return null;
  }

  const root = createRoot(document.createElement('div'));
  act(() => {
    root.render(createElement(TestComponent));
  });
  const unmount = () => {
    act(() => root.unmount());
    mountedRoots.delete(unmount);
  };
  mountedRoots.add(unmount);
  return {
    result: {
      get current() {
        return current;
      },
    },
    unmount,
  };
}

describe('useCallSession', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.actions.length = 0;
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterEach(() => {
    for (const unmount of [...mountedRoots]) {
      unmount();
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('registers event listeners before joining and waits until its peer joins to offer', async () => {
    const { result } = renderHook(() => useCallSession({ roomId, inviteSecret }));

    await act(async () => {
      await result.current.join();
    });

    expect(mocks.actions.indexOf('on:joined')).toBeLessThan(
      mocks.actions.indexOf('joinRoom'),
    );
    expect(mocks.client.joinRoom).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('joining');

    act(() => {
      mocks.handlers.get('joined')?.({
        type: 'joined',
        participantCredential,
        offerer: true,
      });
    });
    expect(result.current.status).toBe('waiting');
    expect(mocks.peer.startOffer).not.toHaveBeenCalled();

    await act(async () => {
      mocks.handlers.get('peerJoined')?.({ type: 'peerJoined' });
    });

    expect(mocks.peer.startOffer).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('connecting');
    expect(sessionStorage.getItem(`webrtc:participant:${roomId}`)).toBe(participantCredential);
  });

  it('does not create signaling or occupy a room when media permission is denied', async () => {
    mocks.createPeerSession.mockRejectedValueOnce(new Error('NotAllowedError'));
    const { result } = renderHook(() => useCallSession({ roomId, inviteSecret }));

    await act(async () => {
      await result.current.join();
    });

    expect(mocks.createSignalingClient).not.toHaveBeenCalled();
    expect(mocks.client.joinRoom).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/camera|microphone/i);
  });

  it('rejects a missing invite before requesting media', async () => {
    const { result } = renderHook(() => useCallSession({ roomId, inviteSecret: '' }));

    await act(async () => {
      await result.current.join();
    });

    expect(mocks.createPeerSession).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/invite/i);
  });

  it('cleans up peer media and signaling on a room error', async () => {
    const { result } = renderHook(() => useCallSession({ roomId, inviteSecret }));
    await act(async () => {
      await result.current.join();
    });
    act(() => {
      mocks.handlers.get('roomError')?.({ type: 'roomError', code: 'ROOM_FULL' });
    });

    expect(result.current.status).toBe('error');
    expect(mocks.peer.close).toHaveBeenCalledOnce();
    expect(mocks.client.disconnect).toHaveBeenCalledOnce();
  });

  it('shows actionable feedback and cleans up when a room has expired', async () => {
    const { result } = renderHook(() => useCallSession({ roomId, inviteSecret }));
    await act(async () => {
      await result.current.join();
    });

    act(() => {
      mocks.handlers.get('roomError')?.({ type: 'roomError', code: 'ROOM_EXPIRED' });
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/expired/i);
    expect(mocks.peer.close).toHaveBeenCalledOnce();
  });

  it('returns to reconnecting without closing the room when the peer rejoins in time', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCallSession({ roomId, inviteSecret }));
    await act(async () => {
      await result.current.join();
    });
    act(() => {
      mocks.handlers.get('joined')?.({
        type: 'joined',
        participantCredential,
        offerer: true,
      });
      mocks.handlers.get('peerLeft')?.({ type: 'peerLeft' });
    });

    await act(async () => {
      mocks.handlers.get('peerRejoined')?.({ type: 'peerRejoined', offerer: false });
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(result.current.status).not.toBe('error');
    expect(mocks.createPeerSession).toHaveBeenCalledTimes(2);
    expect(mocks.peer.startOffer).toHaveBeenCalledOnce();
  });

  it('rejoins with the room-scoped credential after the socket reconnects', async () => {
    const { result } = renderHook(() => useCallSession({ roomId, inviteSecret }));
    await act(async () => {
      await result.current.join();
    });
    act(() => {
      mocks.handlers.get('joined')?.({
        type: 'joined',
        participantCredential,
        offerer: false,
      });
      mocks.handlers.get('disconnect')?.();
    });

    act(() => {
      mocks.handlers.get('connect')?.();
    });

    expect(mocks.client.joinRoom).toHaveBeenCalledTimes(2);
    expect(mocks.client.joinRoom).toHaveBeenLastCalledWith({
      roomId,
      inviteSecret,
      participantCredential,
    });
    expect(result.current.status).toBe('reconnecting');
  });

  it('ends with an error when the peer does not return within the reconnect window', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCallSession({ roomId, inviteSecret }));
    await act(async () => {
      await result.current.join();
    });
    act(() => {
      mocks.handlers.get('peerLeft')?.({ type: 'peerLeft' });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/60 seconds/i);
    expect(mocks.peer.close).toHaveBeenCalledOnce();
    expect(mocks.client.disconnect).toHaveBeenCalledOnce();
  });

  it('cleans up if signaling cannot connect', async () => {
    mocks.client.connect.mockRejectedValueOnce(new Error('SIGNALING_CONNECTION_FAILED'));
    const { result } = renderHook(() => useCallSession({ roomId, inviteSecret }));

    await act(async () => {
      await result.current.join();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('SIGNALING_CONNECTION_FAILED');
    expect(mocks.peer.close).toHaveBeenCalledOnce();
    expect(mocks.client.disconnect).toHaveBeenCalledOnce();
  });

  it('ends the call once and releases peer media and signaling', async () => {
    const { result } = renderHook(() => useCallSession({ roomId, inviteSecret }));
    await act(async () => {
      await result.current.join();
    });
    act(() => {
      mocks.handlers.get('joined')?.({
        type: 'joined',
        participantCredential,
        offerer: true,
      });
    });

    await act(async () => {
      await result.current.endCall();
      await result.current.endCall();
    });

    expect(mocks.client.sendSignal).toHaveBeenCalledOnce();
    expect(mocks.peer.close).toHaveBeenCalledOnce();
    expect(mocks.client.disconnect).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('ended');
  });

  it('keeps signaling open until the end-call acknowledgment arrives', async () => {
    let acknowledgeEndCall!: () => void;
    mocks.client.sendSignal.mockImplementationOnce(
      () =>
        new Promise<{ messageId: string; accepted: boolean }>((resolve) => {
          acknowledgeEndCall = () =>
            resolve({
              messageId: '0136542e-6cc0-42ec-9f2f-0929c080a96b',
              accepted: true,
            });
        }),
    );
    const { result } = renderHook(() => useCallSession({ roomId, inviteSecret }));
    await act(async () => {
      await result.current.join();
    });
    act(() => {
      mocks.handlers.get('joined')?.({
        type: 'joined',
        participantCredential,
        offerer: false,
      });
    });

    let endCallPromise!: Promise<void>;
    act(() => {
      endCallPromise = result.current.endCall();
    });
    act(() => {
      mocks.handlers.get('roomClosed')?.({ type: 'roomClosed', reason: 'CALL_ENDED' });
    });

    expect(mocks.client.disconnect).not.toHaveBeenCalled();

    await act(async () => {
      acknowledgeEndCall();
      await endCallPromise;
    });
    expect(mocks.client.disconnect).toHaveBeenCalledOnce();
  });

  it('closes the peer session and disconnects on unmount', async () => {
    const { result, unmount } = renderHook(() => useCallSession({ roomId, inviteSecret }));
    await act(async () => {
      await result.current.join();
    });

    unmount();

    expect(mocks.peer.close).toHaveBeenCalledOnce();
    expect(mocks.client.disconnect).toHaveBeenCalledOnce();
  });
});
