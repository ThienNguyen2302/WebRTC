import { Injectable } from '@nestjs/common';
import type { RoomStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';

export type RoomRecord = {
  id: string;
  inviteSecretHash: string;
  status: RoomStatus;
  expiresAt: Date;
  createdAt?: Date;
  closedAt?: Date | null;
};

@Injectable()
export class RoomsRepository {
  constructor(private readonly prisma: PrismaService) { }

  async create(input: {
    id: string;
    inviteSecretHash: string;
    expiresAt: Date;
  }): Promise<RoomRecord> {
    return this.prisma.room.create({
      data: {
        id: input.id,
        inviteSecretHash: input.inviteSecretHash,
        status: 'WAITING',
        expiresAt: input.expiresAt,
      },
    });
  }

  async findById(id: string): Promise<RoomRecord | null> {
    return this.prisma.room.findUnique({ where: { id } });
  }

  async activate(id: string): Promise<RoomRecord> {
    return this.prisma.room.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  async close(id: string, status: 'CLOSED' | 'EXPIRED'): Promise<RoomRecord> {
    return this.prisma.room.update({
      where: { id },
      data: {
        status,
        closedAt: new Date(),
      },
    });
  }

  async markExpired(id: string): Promise<RoomRecord> {
    return this.prisma.room.update({
      where: { id },
      data: {
        status: 'EXPIRED',
        closedAt: new Date(),
      },
    });
  }

  async expireWaitingRooms(now: Date): Promise<{ count: number }> {
    const result = await this.prisma.room.updateMany({
      where: {
        status: 'WAITING',
        expiresAt: { lte: now },
      },
      data: {
        status: 'EXPIRED',
        closedAt: now,
      },
    });

    return { count: result.count };
  }

  async closeAllActive(now = new Date()): Promise<{ count: number }> {
    const result = await this.prisma.room.updateMany({
      where: { status: 'ACTIVE' },
      data: {
        status: 'CLOSED',
        closedAt: now,
      },
    });

    return { count: result.count };
  }
}
