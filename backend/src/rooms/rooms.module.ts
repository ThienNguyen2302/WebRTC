import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsRepository } from './rooms.repository.js';
import { RoomsService } from './rooms.service.js';
import { RoomExpiryScheduler } from './room-expiry.scheduler.js';

@Module({
  imports: [PrismaModule],
  controllers: [RoomsController],
  providers: [RoomsRepository, RoomsService, RoomExpiryScheduler],
  exports: [RoomsRepository, RoomsService],
})
export class RoomsModule {}
