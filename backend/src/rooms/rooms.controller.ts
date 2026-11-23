import { Body, Controller, Post } from '@nestjs/common';
import type { CreateRoomResponse } from '@webrtc/contracts';

import { CreateRoomDto } from './dto/create-room.dto.js';
import { RoomsService } from './rooms.service.js';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  createRoom(@Body() _body: CreateRoomDto): Promise<CreateRoomResponse> {
    return this.roomsService.createRoom();
  }
}
