import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../prisma/prisma.service.js';
import { RoomsRepository } from './rooms.repository.js';

describe('RoomsRepository PostgreSQL integration', () => {
  const prisma = new PrismaService();
  const repository = new RoomsRepository(prisma);
  const roomId = randomUUID();
  const inviteSecretHash = 'integration-hash-' + randomUUID();
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
      await prisma.room.deleteMany({ where: { id: roomId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('creates, reads, activates, and closes a room in PostgreSQL', async () => {
    const expiresAt = new Date(Date.now() + 60_000);

    const created = await repository.create({
      id: roomId,
      inviteSecretHash,
      expiresAt,
    });

    expect(created).toMatchObject({
      id: roomId,
      inviteSecretHash,
      status: 'WAITING',
      expiresAt,
    });

    await repository.activate(roomId);
    expect(await repository.findById(roomId)).toMatchObject({
      id: roomId,
      status: 'ACTIVE',
    });

    await repository.close(roomId, 'CLOSED');
    expect(await repository.findById(roomId)).toMatchObject({
      id: roomId,
      status: 'CLOSED',
      closedAt: expect.any(Date),
    });
  });
});
