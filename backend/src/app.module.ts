import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { IceConfigModule } from './ice/ice-config.module.js';
import { RoomsModule } from './rooms/rooms.module.js';
import { SignalingModule } from './signaling/signaling.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    RoomsModule,
    SignalingModule,
    IceConfigModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
