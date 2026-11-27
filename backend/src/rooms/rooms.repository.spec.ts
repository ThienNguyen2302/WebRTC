import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../prisma/prisma.service';
import { RoomsRepository } from './rooms.repository';

describe('RoomsRepository', () => {
  let repository: RoomsRepository;
  let prisma: {
    room: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    prisma = {
      room: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsRepository,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    repository = module.get<RoomsRepository>(RoomsRepository);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists only temporary room metadata', async () => {
    prisma.room.create.mockResolvedValue({
      id: '2d9c6d8a-5c6c-48b8-b4fa-dc3ccdb88a2d',
      inviteSecretHash: 'hash-123',
      status: 'WAITING',
      expiresAt: new Date('2026-11-10T12:00:00.000Z'),
    });

    await repository.create({
      id: '2d9c6d8a-5c6c-48b8-b4fa-dc3ccdb88a2d',
      inviteSecretHash: 'hash-123',
      expiresAt: new Date('2026-11-10T12:00:00.000Z'),
    });

    expect(prisma.room.create).toHaveBeenCalledWith({
      data: {
        id: '2d9c6d8a-5c6c-48b8-b4fa-dc3ccdb88a2d',
        inviteSecretHash: 'hash-123',
        status: 'WAITING',
        expiresAt: new Date('2026-11-10T12:00:00.000Z'),
      },
    });
  });

  it('activates and closes a room idempotently', async () => {
    const roomId = '2d9c6d8a-5c6c-48b8-b4fa-dc3ccdb88a2d';
    const now = new Date('2026-11-26T10:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    prisma.room.updateMany.mockResolvedValue({ count: 1 });
    prisma.room.update.mockResolvedValue({});

    await repository.activate(roomId);
    await repository.close(roomId, 'CLOSED');

    expect(prisma.room.updateMany).toHaveBeenCalledWith({
      where: { id: roomId, status: 'WAITING', expiresAt: { gt: now } },
      data: { status: 'ACTIVE' },
    });
    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: roomId },
      data: {
        status: 'CLOSED',
        closedAt: expect.any(Date),
      },
    });
  });

  it('claims a first participant slot only while the room is unexpired and waiting', async () => {
    const roomId = '2d9c6d8a-5c6c-48b8-b4fa-dc3ccdb88a2d';
    const now = new Date('2026-11-26T10:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    prisma.room.updateMany.mockResolvedValue({ count: 0 });

    await expect(repository.assertWaiting(roomId)).resolves.toBe(false);

    expect(prisma.room.updateMany).toHaveBeenCalledWith({
      where: { id: roomId, status: 'WAITING', expiresAt: { gt: now } },
      data: { status: 'WAITING' },
    });
  });

  it('expires only waiting rooms so a concurrent activation is preserved', async () => {
    const roomId = '2d9c6d8a-5c6c-48b8-b4fa-dc3ccdb88a2d';
    prisma.room.updateMany.mockResolvedValue({ count: 1 });

    await repository.markExpired(roomId);

    expect(prisma.room.updateMany).toHaveBeenCalledWith({
      where: { id: roomId, status: 'WAITING' },
      data: {
        status: 'EXPIRED',
        closedAt: expect.any(Date),
      },
    });
  });
});
