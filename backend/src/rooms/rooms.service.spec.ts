import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

import { RoomsService } from './rooms.service';

describe('RoomsService', () => {
    const roomId = '2d9c6d8a-5c6c-48b8-b4fa-dc3ccdb88a2d';
    const inviteSecret = 'aVeryLongInviteSecretThatMatchesTheContract123';
    const repo = {
        create: vi.fn(),
        findById: vi.fn(),
        activate: vi.fn(),
        close: vi.fn(),
        closeAllActive: vi.fn(),
    };

    const config = {
        get: vi.fn((key: string, fallback?: number) => {
            if (key === 'ROOM_TTL_SECONDS') return fallback ?? 1800;
            return fallback;
        }),
    };

    const service = new RoomsService(repo as any, config as any);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a room and persists only the invite hash', async () => {
        repo.create.mockResolvedValue({
            id: roomId,
            inviteSecretHash: 'hash',
            status: 'WAITING',
            expiresAt: new Date('2026-11-10T12:00:00.000Z'),
        });

        const result = await service.createRoom();

        expect(result.roomId).toBeDefined();
        expect(result.inviteSecret).toBeTruthy();
        expect(result.expiresAt).toBeTruthy();
        expect(repo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                id: result.roomId,
                inviteSecretHash: expect.any(String),
                expiresAt: expect.any(Date),
            }),
        );
        expect(repo.create.mock.calls[0][0].inviteSecretHash).not.toBe(inviteSecret);
    });

    it('rejects rooms that have expired at the boundary', async () => {
        const expiredAt = new Date('2026-11-10T12:00:00.000Z');
        vi.setSystemTime(expiredAt);
        repo.findById.mockResolvedValue({
            id: roomId,
            inviteSecretHash: 'hash',
            status: 'WAITING',
            expiresAt: expiredAt,
        });

        await expect(service.verifyInvite(roomId, 'secret')).rejects.toMatchObject({ code: 'ROOM_EXPIRED' });

        vi.useRealTimers();
    });

    it('accepts a valid invite secret without activating the room', async () => {
        const expiresAt = new Date('2099-11-12T12:00:00.000Z');
        const validSecret = 'abcdefghijklmnopqrstuvwxyz1234567890abcde';
        const digest = createHash('sha256').update(validSecret).digest('hex');

        repo.findById.mockResolvedValue({
            id: roomId,
            inviteSecretHash: digest,
            status: 'WAITING',
            expiresAt,
        });

        await expect(service.verifyInvite(roomId, validSecret)).resolves.toMatchObject({ id: roomId });

        expect(repo.activate).not.toHaveBeenCalled();
    });
});
