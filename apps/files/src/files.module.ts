import { S3Client } from '@aws-sdk/client-s3';
import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { CompleteImageUploadsUseCase } from './application/use-cases/complete-image-uploads/complete-image-uploads.use-case.js';
import { InitiateImageUploadsUseCase } from './application/use-cases/initiate-image-uploads/initiate-image-uploads.use-case.js';
import { filesConfig } from './config/files.config.js';
import { S3_CLIENT } from './infrastructure/s3/s3.constants.js';
import { FilesGrpcController } from './presentation/grpc/files-grpc.controller.js';
import { FilesRepository } from './application/ports/files.repository.js';
import { databaseConfig } from './config/database.config.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { PrismaFilesRepository } from './infrastructure/prisma/repositories/prisma-files.repository.js';
import { ObjectStorage } from './application/ports/object-storage.js';
import { S3ObjectStorage } from './infrastructure/s3/s3-object-storage.js';
import { EnsureCompletedImageUploadsUseCase } from './application/use-cases/ensure-completed-image-uploads/ensure-completed-image-uploads.use-case.js';
import { TestingRepository } from './application/ports/testing.repository.js';
import { DeleteAllDataUseCase } from './application/use-cases/delete-all-data/delete-all-data.use-case.js';
import { PrismaTestingRepository } from './infrastructure/prisma/repositories/prisma-testing.repository.js';
import { TestingGrpcController } from './presentation/grpc/testing-grpc.controller.js';
import { GetPublicFileUrlQueryHandler } from './application/use-cases/get-public-file-url/get-public-file-url.query-handler.js';
import { PostDeletedConsumer } from './presentation/messaging/post-deleted.consumer.js';
import { filesMessageBrokerConfig } from './config/message-broker.config.js';

@Module({
  imports: [
    CqrsModule,
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
      load: [filesConfig, databaseConfig, filesMessageBrokerConfig],
    }),
    PrismaModule,
  ],
  controllers: [FilesGrpcController, TestingGrpcController, PostDeletedConsumer],
  providers: [
    CompleteImageUploadsUseCase,
    DeleteAllDataUseCase,
    EnsureCompletedImageUploadsUseCase,
    InitiateImageUploadsUseCase,
    GetPublicFileUrlQueryHandler,
    {
      provide: FilesRepository,
      useClass: PrismaFilesRepository,
    },
    {
      provide: ObjectStorage,
      useClass: S3ObjectStorage,
    },
    {
      provide: TestingRepository,
      useClass: PrismaTestingRepository,
    },
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
