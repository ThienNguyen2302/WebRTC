import { describe, expect, it } from 'vitest';

import {
  ClientSignalSchema,
  IceServerConfigSchema,
  ServerSignalSchema,
  SignalAckSchema,
} from '../index';

describe('signaling contracts', () => {
  it('accepts valid offer, answer, candidate, end-call and server events', () => {
    const offer = {
      type: 'offer',
      id: '123e4567-e89b-12d3-a456-426614174000',
      roomId: '123e4567-e89b-12d3-a456-426614174001',
      payload: { sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' },
    };

    const ice = {
      type: 'iceCandidate',
      id: '123e4567-e89b-12d3-a456-426614174002',
      roomId: '123e4567-e89b-12d3-a456-426614174001',
      payload: {
        candidate: 'candidate:0 1 UDP 2122252543 127.0.0.1 1234 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      },
    };

    const ack = { messageId: '123e4567-e89b-12d3-a456-426614174003', accepted: true };
    const iceServerConfig = [{ urls: ['stun:stun.l.google.com:19302'] }];
    const serverSignal = {
      type: 'joined',
      participantCredential: 'cred-123',
      offerer: true,
    };

    expect(ClientSignalSchema.safeParse(offer).success).toBe(true);
    expect(ClientSignalSchema.safeParse(ice).success).toBe(true);
    expect(SignalAckSchema.safeParse(ack).success).toBe(true);
    expect(IceServerConfigSchema.safeParse(iceServerConfig).success).toBe(true);
    expect(ServerSignalSchema.safeParse(serverSignal).success).toBe(true);
  });

  it('rejects malformed or unexpected signal payloads', () => {
    expect(
      ClientSignalSchema.safeParse({
        type: 'future',
        id: '123e4567-e89b-12d3-a456-426614174010',
        roomId: '123e4567-e89b-12d3-a456-426614174011',
        payload: {},
      }).success,
    ).toBe(false);

    expect(
      ClientSignalSchema.safeParse({
        type: 'endCall',
        id: '123e4567-e89b-12d3-a456-426614174012',
        roomId: '123e4567-e89b-12d3-a456-426614174013',
        payload: { candidate: 'bad' },
      }).success,
    ).toBe(false);

    expect(
      SignalAckSchema.safeParse({ messageId: 'not-a-uuid', accepted: false }).success,
    ).toBe(false);

    expect(
      ServerSignalSchema.safeParse({
        type: 'signal',
        message: { type: 'offer', id: 'missing-uuid', roomId: 'abc', payload: {} },
      }).success,
    ).toBe(false);
  });
});
