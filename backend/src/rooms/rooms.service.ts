import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { CreateRoomResponse, RoomErrorCode } from '@webrtc/contracts';

import { RoomsRepository, type RoomRecord } from './rooms.repository.js';

export class RoomServiceError extends Error {
    constructor(public readonly code: RoomErrorCode) {
        super(code);
        this.name = 'RoomServiceError';
    }
}

@Injectable()
export class RoomsService implements OnModuleInit {
    constructor(
        private readonly roomsRepository: RoomsRepository,
        private readonly configService: ConfigService,
    ) {}

    async onModuleInit(): Promise<void> {
        await this.roomsRepository.closeAllActive();
    }

    async createRoom(): Promise<CreateRoomResponse> {
        const roomId = randomUUID();
        const inviteSecret = randomBytes(32).toString('base64url');
        const ttlSeconds = Number(this.configService.get<number>('ROOM_TTL_SECONDS', 1800));
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
        const inviteSecretHash = createHash('sha256').update(inviteSecret).digest('hex');

        await this.roomsRepository.create({
            id: roomId,
            inviteSecretHash,
            expiresAt,
        });

        return {
            roomId,
            inviteSecret,
            expiresAt: expiresAt.toISOString(),
        };
    }

    async verifyInvite(roomId: string, inviteSecret: string): Promise<RoomRecord> {
        const room = await this.roomsRepository.findById(roomId);

        if (!room) {
            throw new RoomServiceError('ROOM_NOT_FOUND');
        }

        if (room.status === 'EXPIRED' || room.status === 'CLOSED') {
            throw new RoomServiceError('ROOM_EXPIRED');
        }

        if (room.status === 'WAITING' && new Date(room.expiresAt).getTime() <= Date.now()) {
            await this.roomsRepository.markExpired(roomId);
            throw new RoomServiceError('ROOM_EXPIRED');
        }

        const providedHash = createHash('sha256').update(inviteSecret).digest();
        const expectedHash = Buffer.from(room.inviteSecretHash, 'hex');

        if (providedHash.length !== expectedHash.length || !timingSafeEqual(providedHash, expectedHash)) {
            throw new RoomServiceError('NOT_AUTHORIZED');
        }

        return room;
    }

    async assertWaitingRoom(roomId: string): Promise<void> {
        if (!(await this.roomsRepository.assertWaiting(roomId))) {
            throw new RoomServiceError('ROOM_EXPIRED');
        }
    }

    async activateRoom(roomId: string): Promise<void> {
        if (!(await this.roomsRepository.activate(roomId))) {
            throw new RoomServiceError('ROOM_EXPIRED');
        }
    }

    async closeRoom(roomId: string, status: 'CLOSED' | 'EXPIRED' = 'CLOSED'): Promise<void> {
        await this.roomsRepository.close(roomId, status);
    }
}
