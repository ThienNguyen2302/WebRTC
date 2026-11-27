import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RoomServiceError, RoomsService } from '../rooms/rooms.service.js';
import { RoomPresence } from './room-presence.js';
import { SignalingGateway, type RoomSocket } from './signaling.gateway.js';

const roomId = '2d9c6d8a-5c6c-48b8-b4fa-dc3ccdb88a2d';
const otherRoomId = '9d9c6d8a-5c6c-48b8-b4fa-dc3ccdb88a2d';
const inviteSecret = 'a'.repeat(43);

type RecordedEvent = { event: string; payload: unknown };

interface RecordingSocket extends RoomSocket {
  events: RecordedEvent[];
  received(event: string): unknown[];
}

function createSocket(id: string): RecordingSocket {
  const events: RecordedEvent[] = [];

  return {
    id,
    events,
    emit(event, payload) {
      events.push({ event, payload });
    },
    received(event) {
      return events.filter((item) => item.event === event).map((item) => item.payload);
    },
  };
}

function joinRequest(
  requestRoomId = roomId,
  participantCredential?: string,
): { roomId: string; inviteSecret: string; participantCredential?: string } {
  return {
    roomId: requestRoomId,
    inviteSecret,
    ...(participantCredential ? { participantCredential } : {}),
  };
}

function offer(id = randomUUID(), signalRoomId = roomId) {
  return {
    id,
    roomId: signalRoomId,
    type: 'offer' as const,
    payload: { sdp: 'v=0' },
  };
}

describe('SignalingGateway', () => {
  let moduleRef: TestingModule;
  let gateway: SignalingGateway;
  let roomsService: {
    verifyInvite: ReturnType<typeof vi.fn>;
    assertWaitingRoom: ReturnType<typeof vi.fn>;
    activateRoom: ReturnType<typeof vi.fn>;
    closeRoom: ReturnType<typeof vi.fn>;
  };
  let configService: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    roomsService = {
      verifyInvite: vi.fn().mockImplementation(async (id: string) => ({
        id,
        inviteSecretHash: 'hash',
        status: 'WAITING',
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      })),
      assertWaitingRoom: vi.fn().mockResolvedValue(undefined),
      activateRoom: vi.fn().mockResolvedValue(undefined),
      closeRoom: vi.fn().mockResolvedValue(undefined),
    };
    configService = {
      get: vi.fn((_key: string, fallback: unknown) => fallback),
    };
    moduleRef = await Test.createTestingModule({
      providers: [
        SignalingGateway,
        RoomPresence,
        { provide: RoomsService, useValue: roomsService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    gateway = moduleRef.get(SignalingGateway);
  });

  afterEach(async () => {
    await moduleRef.close();
    vi.useRealTimers();
  });

  it.each(['ROOM_NOT_FOUND', 'ROOM_EXPIRED', 'NOT_AUTHORIZED'] as const)(
    'reports %s when invite verification fails',
    async (code) => {
      roomsService.verifyInvite.mockRejectedValueOnce(new RoomServiceError(code));
      const socket = createSocket('socket-a');

      await gateway.joinRoom(socket, joinRequest());

      expect(socket.received('roomError')).toEqual([{ type: 'roomError', code }]);
      expect(socket.received('joined')).toHaveLength(0);
    },
  );

  it('rejects malformed join requests before checking the room', async () => {
    const socket = createSocket('socket-a');

    await gateway.joinRoom(socket, { ...joinRequest(), unexpected: true });

    expect(socket.received('roomError')).toEqual([
      { type: 'roomError', code: 'INVALID_MESSAGE' },
    ]);
    expect(roomsService.verifyInvite).not.toHaveBeenCalled();
  });

  it('admits two participants and rejects any third participant', async () => {
    const first = createSocket('socket-a');
    const second = createSocket('socket-b');
    const third = createSocket('socket-c');

    await gateway.joinRoom(first, joinRequest());
    await gateway.joinRoom(second, joinRequest());
    await gateway.joinRoom(third, joinRequest());

    expect(first.received('joined')).toEqual([
      { type: 'joined', participantCredential: expect.any(String), offerer: true },
    ]);
    expect(second.received('joined')).toEqual([
      { type: 'joined', participantCredential: expect.any(String), offerer: false },
    ]);
    expect(first.received('peerJoined')).toEqual([{ type: 'peerJoined' }]);
    expect(third.received('roomError')).toEqual([
      { type: 'roomError', code: 'ROOM_FULL' },
    ]);
    expect(roomsService.activateRoom).toHaveBeenCalledOnce();
  });

  it('does not admit the first participant if expiry wins after invite verification', async () => {
    roomsService.assertWaitingRoom.mockRejectedValueOnce(new RoomServiceError('ROOM_EXPIRED'));
    const socket = createSocket('socket-a');

    await gateway.joinRoom(socket, joinRequest());

    expect(roomsService.assertWaitingRoom).toHaveBeenCalledWith(roomId);
    expect(socket.received('roomError')).toEqual([
      { type: 'roomError', code: 'ROOM_EXPIRED' },
    ]);
    expect(socket.received('joined')).toHaveLength(0);
    expect(roomsService.activateRoom).not.toHaveBeenCalled();
  });

  it('does not admit the second participant if expiry wins before activation', async () => {
    const first = createSocket('socket-a');
    const second = createSocket('socket-b');
    await gateway.joinRoom(first, joinRequest());
    roomsService.activateRoom.mockRejectedValueOnce(new RoomServiceError('ROOM_EXPIRED'));

    await gateway.joinRoom(second, joinRequest());

    expect(second.received('roomError')).toEqual([
      { type: 'roomError', code: 'ROOM_EXPIRED' },
    ]);
    expect(second.received('joined')).toHaveLength(0);
    expect(first.received('peerJoined')).toHaveLength(0);
    expect(first.received('roomClosed')).toEqual([
      { type: 'roomClosed', reason: 'ROOM_EXPIRED' },
    ]);
  });

  it('uses the updated presence state when first joins race each other', async () => {
    const first = createSocket('socket-a');
    const second = createSocket('socket-b');

    await Promise.all([
      gateway.joinRoom(first, joinRequest()),
      gateway.joinRoom(second, joinRequest()),
    ]);

    expect([first, second].flatMap((socket) => socket.received('joined'))).toHaveLength(2);
    expect([first, second].flatMap((socket) => socket.received('joined')).filter(
      (joined) => (joined as { offerer: boolean }).offerer,
    )).toHaveLength(1);
    expect(roomsService.activateRoom).toHaveBeenCalledOnce();
  });

  it('admits only one of two concurrent attempts for the last participant slot', async () => {
    const first = createSocket('socket-a');
    const candidateA = createSocket('socket-c');
    const candidateB = createSocket('socket-d');
    await gateway.joinRoom(first, joinRequest());

    await Promise.all([
      gateway.joinRoom(candidateA, joinRequest()),
      gateway.joinRoom(candidateB, joinRequest()),
    ]);

    expect([candidateA, candidateB].filter((socket) => socket.received('joined').length === 1))
      .toHaveLength(1);
    expect(
      [candidateA, candidateB].filter((socket) => socket.received('roomError').length === 1),
    ).toHaveLength(1);
  });

  it('rejects signals for another room and client-supplied sender fields', async () => {
    const first = createSocket('socket-a');
    const second = createSocket('socket-b');
    await gateway.joinRoom(first, joinRequest());
    await gateway.joinRoom(second, joinRequest());

    const wrongRoomAck = vi.fn();
    await gateway.signal(first, offer(randomUUID(), otherRoomId), wrongRoomAck);
    const spoofedSenderAck = vi.fn();
    await gateway.signal(first, { ...offer(), sender: 'socket-b' }, spoofedSenderAck);

    expect(wrongRoomAck).toHaveBeenCalledWith({
      messageId: expect.any(String),
      accepted: false,
    });
    expect(spoofedSenderAck).toHaveBeenCalledWith({
      messageId: expect.any(String),
      accepted: false,
    });
    expect(first.received('roomError')).toEqual([
      { type: 'roomError', code: 'NOT_AUTHORIZED' },
      { type: 'roomError', code: 'INVALID_MESSAGE' },
    ]);
    expect(second.received('signal')).toHaveLength(0);
  });

  it('rejects signals from a socket that has not joined a room', async () => {
    const socket = createSocket('socket-unjoined');
    const ack = vi.fn();

    await gateway.signal(socket, offer(), ack);

    expect(ack).toHaveBeenCalledWith({
      messageId: expect.any(String),
      accepted: false,
    });
    expect(socket.received('roomError')).toEqual([
      { type: 'roomError', code: 'NOT_AUTHORIZED' },
    ]);
  });

  it('relays an identical message ID once and rejects conflicting reuse', async () => {
    const first = createSocket('socket-a');
    const second = createSocket('socket-b');
    await gateway.joinRoom(first, joinRequest());
    await gateway.joinRoom(second, joinRequest());
    const message = offer();
    const firstAck = vi.fn();
    const duplicateAck = vi.fn();
    const conflictAck = vi.fn();

    await gateway.signal(first, message, firstAck);
    await gateway.signal(first, message, duplicateAck);
    await gateway.signal(first, { ...message, payload: { sdp: 'v=1' } }, conflictAck);

    expect(firstAck).toHaveBeenCalledWith({ messageId: message.id, accepted: true });
    expect(duplicateAck).toHaveBeenCalledWith({ messageId: message.id, accepted: true });
    expect(conflictAck).toHaveBeenCalledWith({ messageId: message.id, accepted: false });
    expect(second.received('signal')).toHaveLength(1);
    expect(first.received('roomError')).toEqual([
      { type: 'roomError', code: 'INVALID_MESSAGE' },
    ]);
  });

  it('reclaims the original slot after reconnect and preserves its offerer role', async () => {
    vi.useFakeTimers();
    const first = createSocket('socket-a');
    const second = createSocket('socket-b');
    await gateway.joinRoom(first, joinRequest());
    await gateway.joinRoom(second, joinRequest());
    const credential = (
      first.received('joined')[0] as { participantCredential: string }
    ).participantCredential;
    gateway.handleDisconnect(first);
    const reconnected = createSocket('socket-a-reconnected');

    await gateway.joinRoom(reconnected, joinRequest(roomId, credential));

    expect(reconnected.received('joined')).toEqual([
      { type: 'joined', participantCredential: credential, offerer: true },
    ]);
    expect(second.received('peerRejoined')).toEqual([
      { type: 'peerRejoined', offerer: true },
    ]);
    expect(roomsService.activateRoom).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(roomsService.closeRoom).not.toHaveBeenCalled();
  });

  it('closes the room when a reconnect reservation expires', async () => {
    vi.useFakeTimers();
    const first = createSocket('socket-a');
    const second = createSocket('socket-b');
    await gateway.joinRoom(first, joinRequest());
    await gateway.joinRoom(second, joinRequest());
    gateway.handleDisconnect(first);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(roomsService.closeRoom).toHaveBeenCalledWith(roomId, 'CLOSED');
    expect(second.received('roomClosed')).toEqual([
      { type: 'roomClosed', reason: 'RECONNECT_TIMEOUT' },
    ]);
  });

  it('closes and clears a room on explicit leave', async () => {
    const first = createSocket('socket-a');
    const second = createSocket('socket-b');
    await gateway.joinRoom(first, joinRequest());
    await gateway.joinRoom(second, joinRequest());

    await gateway.leaveRoom(first);

    expect(roomsService.closeRoom).toHaveBeenCalledWith(roomId, 'CLOSED');
    expect(first.received('roomClosed')).toEqual([
      { type: 'roomClosed', reason: 'CALL_ENDED' },
    ]);
    expect(second.received('roomClosed')).toEqual([
      { type: 'roomClosed', reason: 'CALL_ENDED' },
    ]);
  });

  it('closes the room when an admitted participant sends endCall', async () => {
    const first = createSocket('socket-a');
    const second = createSocket('socket-b');
    await gateway.joinRoom(first, joinRequest());
    await gateway.joinRoom(second, joinRequest());
    const messageId = randomUUID();
    const ack = vi.fn();

    await gateway.signal(
      first,
      { id: messageId, roomId, type: 'endCall', payload: {} },
      ack,
    );

    expect(ack).toHaveBeenCalledWith({ messageId, accepted: true });
    expect(roomsService.closeRoom).toHaveBeenCalledWith(roomId, 'CLOSED');
    expect(second.received('roomClosed')).toEqual([
      { type: 'roomClosed', reason: 'CALL_ENDED' },
    ]);
  });
});
