import { describe, expect, it } from 'vitest';

import {
  CreateRoomResponseSchema,
  JoinRoomRequestSchema,
  RoomErrorCodeSchema,
} from '../index';

describe('room contracts', () => {
  it('accepts a valid room creation response and invite join request', () => {
    const room = {
      roomId: '123e4567-e89b-12d3-a456-426614174000',
      inviteSecret: 'aVeryLongInviteSecretThatMatchesTheContract123',
      expiresAt: new Date('2026-11-10T12:00:00.000Z').toISOString(),
    };

    expect(CreateRoomResponseSchema.safeParse(room).success).toBe(true);

    const join = {
      roomId: '123e4567-e89b-12d3-a456-426614174000',
      inviteSecret: 'aVeryLongInviteSecretThatMatchesTheContract123',
      participantCredential: 'participant-credential-123',
    };

    expect(JoinRoomRequestSchema.safeParse(join).success).toBe(true);
    expect(RoomErrorCodeSchema.safeParse('ROOM_NOT_FOUND').success).toBe(true);
  });

  it('rejects malformed room metadata', () => {
    expect(
      CreateRoomResponseSchema.safeParse({
        roomId: 'not-a-uuid',
        inviteSecret: 'short',
        expiresAt: 'bad-date',
      }).success,
    ).toBe(false);

    expect(
      JoinRoomRequestSchema.safeParse({
        roomId: '123e4567-e89b-12d3-a456-426614174000',
        inviteSecret: 'short',
      }).success,
    ).toBe(false);

    expect(RoomErrorCodeSchema.safeParse('NOT_A_REAL_CODE').success).toBe(false);
  });
});
