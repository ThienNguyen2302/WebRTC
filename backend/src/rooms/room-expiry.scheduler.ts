import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { RoomsRepository } from './rooms.repository.js';

@Injectable()
export class RoomExpiryScheduler {
  constructor(private readonly roomsRepository: RoomsRepository) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireWaitingRooms(): Promise<void> {
    await this.roomsRepository.expireWaitingRooms(new Date());
  }
}
