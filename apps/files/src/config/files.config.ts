import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEnum, IsInt, IsString, Max, Min } from 'class-validator';
import { configValidationUtility, Environments } from '@libs/config/index.js';

@Injectable()
export class FilesConfig {
  @IsInt({ message: 'Set env variable FILES_TCP_PORT, example: 3000' })
  @Min(0)
  @Max(65535)
  readonly tcpPort: number;

  @IsString({ message: 'Set env variable FILES_TCP_HOST' })
  readonly tcpHost: string;

  @IsEnum(Environments, {
    message:
      'Set correct NODE_ENV value, available values: ' +
      configValidationUtility.getEnumValues(Environments).join(', '),
  })
  readonly env: Environments;

  constructor(configService: ConfigService) {
    this.tcpPort = configValidationUtility.convertToNumber(
      configService.getOrThrow<string>('FILES_TCP_PORT'),
    );
    this.tcpHost = configService.getOrThrow<string>('FILES_TCP_HOST');
    this.env = configService.get<Environments>('NODE_ENV', Environments.DEVELOPMENT);

    configValidationUtility.validateConfig(this);
  }
}
