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
      load: [filesConfig, databaseConfig],
    }),
    PrismaModule,
  ],
  controllers: [FilesGrpcController],
  providers: [
    CompleteImageUploadsUseCase,
    EnsureCompletedImageUploadsUseCase,
    InitiateImageUploadsUseCase,
    {
      provide: FilesRepository,
      useClass: PrismaFilesRepository,
    },
    {
      provide: ObjectStorage,
      useClass: S3ObjectStorage,
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
