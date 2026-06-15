import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEnum, IsInt, IsString, Max, Min } from 'class-validator';
import { configValidationUtility, Environments } from '../../../../libs/config/index.js';

@Injectable()
export class PostsConfig {
  @IsInt({ message: 'Set env variable POSTS_PORT, example: 3000' })
  @Min(0)
  @Max(65535)
  readonly port: number;

  @IsString({ message: 'Set env variable POSTS_DATABASE_URL' })
  readonly databaseUrl: string;

  @IsEnum(Environments, {
    message:
      'Set correct NODE_ENV value, available values: ' +
      configValidationUtility.getEnumValues(Environments).join(', '),
  })
  readonly env: Environments;

  constructor(configService: ConfigService) {
    this.port = configValidationUtility.convertToNumber(configService.getOrThrow<string>('POSTS_PORT'));
    this.databaseUrl = configService.getOrThrow<string>('POSTS_DATABASE_URL');
    this.env = configService.get<Environments>('NODE_ENV', Environments.DEVELOPMENT);

    configValidationUtility.validateConfig(this);
  }
}
