import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClientSignal } from '@webrtc/contracts';

const mocks = vi.hoisted(() => {
  const emitted: Array<{ event: string; args: unknown[] }> = [];
  const anyHandlers: Array<(event: string, payload: unknown) => void> = [];
  const eventHandlers = new Map<string, Array<(...args: unknown[]) => void>>();
  let autoAck = true;
  const socket = {
    connected: false,
    onAny: vi.fn((handler: (event: string, payload: unknown) => void) => {
      anyHandlers.push(handler);
    }),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      eventHandlers.set(event, [...(eventHandlers.get(event) ?? []), handler]);
      return socket;
    }),
    once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      eventHandlers.set(event, [...(eventHandlers.get(event) ?? []), handler]);
      return socket;
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      eventHandlers.set(
        event,
        (eventHandlers.get(event) ?? []).filter((registered) => registered !== handler),
      );
      return socket;
    }),
    connect: vi.fn(() => {
      socket.connected = true;
      for (const handler of eventHandlers.get('connect') ?? []) {
        handler();
      }
    }),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      emitted.push({ event, args });
      if (event === 'signal' && autoAck) {
        const signal = args[0] as ClientSignal;
        const ack = args[1] as (payload: unknown) => void;
        ack({ messageId: signal.id, accepted: true });
      }
    }),
    disconnect: vi.fn(() => {
      socket.connected = false;
    }),
  };
  return {
    socket,
    emitted,
    anyHandlers,
    eventHandlers,
    setAutoAck(value: boolean) {
      autoAck = value;
    },
    io: vi.fn(() => socket),
  };
});

vi.mock('socket.io-client', () => ({ io: mocks.io }));

import { createSignalingClient } from './socket-client';

const signal: ClientSignal = {
  id: '0136542e-6cc0-42ec-9f2f-0929c080a96b',
  roomId: '2d9c6d8a-5c6c-48b8-b4fa-dc3ccdb88a2d',
  type: 'offer',
  payload: { sdp: 'v=0' },
};

describe('signaling client', () => {
  beforeEach(() => {
    mocks.emitted.length = 0;
    mocks.anyHandlers.length = 0;
    mocks.eventHandlers.clear();
    mocks.socket.connected = false;
    mocks.setAutoAck(true);
    vi.stubEnv('NEXT_PUBLIC_SIGNALING_URL', 'https://signal.example.test');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('validates server events before delivering them to listeners', () => {
    const client = createSignalingClient();
    const joined = vi.fn();
    const protocolError = vi.fn();
    client.on('joined', joined);
    client.on('error', protocolError);
    const onAny = mocks.anyHandlers[0];

    onAny?.('joined', { type: 'joined', participantCredential: 42, offerer: true });

    expect(joined).not.toHaveBeenCalled();
    expect(protocolError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'SIGNALING_INVALID_MESSAGE',
    }));
  });

  it('surfaces unknown server events instead of silently ignoring them', () => {
    const client = createSignalingClient();
    const protocolError = vi.fn();
    client.on('error', protocolError);

    mocks.anyHandlers[0]?.('futureEvent', {});

    expect(protocolError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'SIGNALING_INVALID_MESSAGE',
    }));
  });

  it('sends a validated signal and accepts its matching acknowledgment', async () => {
    const client = createSignalingClient();

    await expect(client.sendSignal(signal)).resolves.toEqual({
      messageId: signal.id,
      accepted: true,
    });

    expect(mocks.emitted).toEqual([{ event: 'signal', args: [signal, expect.any(Function)] }]);
  });

  it('retries an unacknowledged message with the same ID before failing', async () => {
    vi.useFakeTimers();
    mocks.setAutoAck(false);
    const client = createSignalingClient();
    const send = client.sendSignal(signal);
    const deliveryFailure = expect(send).rejects.toThrow('SIGNALING_DELIVERY_FAILED');

    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.emitted).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.emitted).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1000);

    await deliveryFailure;
    expect(
      mocks.emitted.map(({ args }) => (args[0] as ClientSignal).id),
    ).toEqual([signal.id, signal.id, signal.id]);
  });
});
