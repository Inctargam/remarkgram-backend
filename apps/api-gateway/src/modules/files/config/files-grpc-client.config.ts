import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEnum, IsString } from 'class-validator';
import { configValidationUtility, Environments } from '../../../../../../libs/config/index.js';

@Injectable()
export class FilesGrpcClientConfig {
  @IsString({ message: 'Set env variable FILES_GRPC_URL, example:localhost:50051 ' })
  readonly url: string;

  @IsEnum(Environments, {
    message:
      'Set correct NODE_ENV value, available values: ' +
      configValidationUtility.getEnumValues(Environments).join(', '),
  })
  readonly env: Environments;

  constructor(configService: ConfigService) {
    this.url = configService.getOrThrow<string>('FILES_GRPC_URL');
    this.env = configService.get<Environments>('NODE_ENV', Environments.DEVELOPMENT);

    configValidationUtility.validateConfig(this);
  }
}
