import { Module } from '@nestjs/common';

import { IceConfigController } from './ice-config.controller.js';
import { IceConfigService } from './ice-config.service.js';

@Module({
  controllers: [IceConfigController],
  providers: [IceConfigService],
})
export class IceConfigModule {}
