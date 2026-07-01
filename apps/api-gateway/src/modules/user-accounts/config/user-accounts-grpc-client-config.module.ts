import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UserAccountsGrpcClientConfig } from './user-accounts-grpc-client.config.js';

@Module({
  imports: [ConfigModule],
  providers: [UserAccountsGrpcClientConfig],
  exports: [UserAccountsGrpcClientConfig],
})
export class UserAccountsGrpcClientConfigModule {}
