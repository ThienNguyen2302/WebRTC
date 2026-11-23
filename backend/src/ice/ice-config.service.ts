import { InternalServerErrorException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IceServerConfigSchema, type IceServerConfig } from '@webrtc/contracts';

@Injectable()
export class IceConfigService {
  constructor(private readonly configService: ConfigService) {}

  getIceServers(): IceServerConfig {
    const rawConfig = this.configService.get<string>('ICE_SERVERS_JSON');
    if (rawConfig === undefined) {
      throw new InternalServerErrorException('ICE_CONFIGURATION_MISSING');
    }

    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(rawConfig);
    } catch {
      throw new InternalServerErrorException('ICE_CONFIGURATION_INVALID');
    }

    const result = IceServerConfigSchema.safeParse(parsedConfig);
    if (!result.success) {
      throw new InternalServerErrorException('ICE_CONFIGURATION_INVALID');
    }

    return result.data;
  }
}
