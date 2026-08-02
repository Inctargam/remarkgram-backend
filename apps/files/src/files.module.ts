import { S3Client } from '@aws-sdk/client-s3';
import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { filesConfig } from './config/files.config.js';
import { S3_CLIENT } from './infrastructure/s3/s3.constants.js';
import { FilesGrpcController } from './presentation/grpc/files-grpc.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [
        `apps/files/.env.${process.env.NODE_ENV}.local`,
        `apps/files/.env.${process.env.NODE_ENV}`,
        'apps/files/.env.production',
        'apps/files/.env',
        `.env.${process.env.NODE_ENV}.local`,
        `.env.${process.env.NODE_ENV}`,
        '.env.production',
        '.env',
      ],
      load: [filesConfig],
    }),
  ],
  controllers: [FilesGrpcController],
  providers: [
    {
      provide: S3_CLIENT,
      inject: [filesConfig.KEY],
      useFactory: (config: ConfigType<typeof filesConfig>) =>
        new S3Client({
          endpoint: config.s3.endpoint,
          region: config.s3.region,
          credentials: {
            accessKeyId: config.s3.accessKeyId,
            secretAccessKey: config.s3.secretAccessKey,
          },
        }),
    },
  ],
})
export class FilesModule {}
