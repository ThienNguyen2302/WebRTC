import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../prisma/prisma.service.js';
import { RoomsRepository } from './rooms.repository.js';
import { RoomsService } from './rooms.service.js';

describe('RoomsService PostgreSQL integration', () => {
  const prisma = new PrismaService();
  const repository = new RoomsRepository(prisma);
  const service = new RoomsService(repository, new ConfigService());
  let roomId: string | undefined;
  let connected = false;

  beforeAll(async () => {
    await prisma.$connect();
    connected = true;
  });

  afterAll(async () => {
    if (!connected) {
      return;
    }

    try {
      if (roomId) {
        await prisma.room.deleteMany({ where: { id: roomId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('stores the invite hash and returns the plaintext secret only to the caller', async () => {
    const response = await service.createRoom();
    roomId = response.roomId;
    const room = await repository.findById(response.roomId);

    expect(room).toMatchObject({
      id: response.roomId,
      inviteSecretHash: createHash('sha256').update(response.inviteSecret).digest('hex'),
      status: 'WAITING',
      expiresAt: new Date(response.expiresAt),
    });
    expect(room?.inviteSecretHash).not.toBe(response.inviteSecret);
  });
});
