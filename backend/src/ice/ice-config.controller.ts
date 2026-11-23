import { Controller, Get } from '@nestjs/common';
import type { IceServerConfig } from '@webrtc/contracts';

import { IceConfigService } from './ice-config.service.js';

@Controller('ice-servers')
export class IceConfigController {
  constructor(private readonly iceConfigService: IceConfigService) {}

  @Get()
  getIceServers(): IceServerConfig {
    return this.iceConfigService.getIceServers();
  }
}
