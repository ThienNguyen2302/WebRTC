import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

import { RoomsService } from './rooms.service';

describe('RoomsService', () => {
    const roomId = '2d9c6d8a-5c6c-48b8-b4fa-dc3ccdb88a2d';
    const repo = {
        create: vi.fn(),
        findById: vi.fn(),
        activate: vi.fn(),
        close: vi.fn(),
        markExpired: vi.fn(),
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

    afterEach(() => {
        vi.useRealTimers();
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
        expect(Buffer.from(result.inviteSecret, 'base64url')).toHaveLength(32);
        expect(result.expiresAt).toBeTruthy();
        const persistedRoom = repo.create.mock.calls[0][0];
        expect(persistedRoom).toMatchObject({
            id: result.roomId,
            inviteSecretHash: createHash('sha256').update(result.inviteSecret).digest('hex'),
            expiresAt: expect.any(Date),
        });
        expect(persistedRoom).not.toHaveProperty('inviteSecret');
    });

    it('uses the configured waiting-room TTL', async () => {
        const now = new Date('2026-11-24T09:00:00.000Z');
        vi.useFakeTimers();
        vi.setSystemTime(now);
        config.get.mockReturnValueOnce(45);

        await service.createRoom();

        expect(repo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                expiresAt: new Date(now.getTime() + 45_000),
            }),
        );
    });

    it('uses a 30-minute waiting-room TTL by default', async () => {
        const now = new Date('2026-11-24T09:00:00.000Z');
        vi.useFakeTimers();
        vi.setSystemTime(now);

        await service.createRoom();

        expect(repo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                expiresAt: new Date(now.getTime() + 1_800_000),
            }),
        );
    });

    it('closes active rooms left by a previous process during startup', async () => {
        await service.onModuleInit();

        expect(repo.closeAllActive).toHaveBeenCalledOnce();
    });

    it('propagates persistence failure instead of returning an invite', async () => {
        const error = new Error('database unavailable');
        repo.create.mockRejectedValueOnce(error);

        await expect(service.createRoom()).rejects.toBe(error);
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
        expect(repo.markExpired).toHaveBeenCalledWith(roomId);

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

    it('does not expire an active room when the waiting-room TTL has passed', async () => {
        const validSecret = 'abcdefghijklmnopqrstuvwxyz1234567890abcde';
        const digest = createHash('sha256').update(validSecret).digest('hex');
        repo.findById.mockResolvedValue({
            id: roomId,
            inviteSecretHash: digest,
            status: 'ACTIVE',
            expiresAt: new Date('2020-01-01T00:00:00.000Z'),
        });

        await expect(service.verifyInvite(roomId, validSecret)).resolves.toMatchObject({ id: roomId });

        expect(repo.markExpired).not.toHaveBeenCalled();
    });
});
