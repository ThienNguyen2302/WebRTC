import { Module } from '@nestjs/common';

import { RoomsModule } from '../rooms/rooms.module.js';
import { RoomPresence } from './room-presence.js';
import { SignalingGateway } from './signaling.gateway.js';

@Module({
  imports: [RoomsModule],
  providers: [RoomPresence, SignalingGateway],
})
export class SignalingModule {}
