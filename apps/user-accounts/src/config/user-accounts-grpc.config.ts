import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsString } from 'class-validator';
import { configValidationUtility } from '@app/config';

@Injectable()
export class UserAccountsGrpcConfig {
  @IsString({
    message: 'Set env variable USER_ACCOUNTS_GRPC_URL, example: localhost:50052',
  })
  readonly url: string;

  constructor(configService: ConfigService) {
    this.url = configService.getOrThrow<string>('USER_ACCOUNTS_GRPC_URL');
    configValidationUtility.validateConfig(this);
  }
}
