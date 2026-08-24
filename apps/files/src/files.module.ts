import { S3Client } from '@aws-sdk/client-s3';
import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { AttachReservedImageUploadsUseCase } from './application/use-cases/attach-reserved-image-uploads/attach-reserved-image-uploads.use-case.js';
import { CleanupExpiredImageUploadsUseCase } from './application/use-cases/cleanup-expired-image-uploads/cleanup-expired-image-uploads.use-case.js';
import { CompleteImageUploadsUseCase } from './application/use-cases/complete-image-uploads/complete-image-uploads.use-case.js';
import { InitiateImageUploadsUseCase } from './application/use-cases/initiate-image-uploads/initiate-image-uploads.use-case.js';
import { ReserveImageUploadsUseCase } from './application/use-cases/reserve-image-uploads/reserve-image-uploads.use-case.js';
import { ReleaseReservedImageUploadsUseCase } from './application/use-cases/release-reserved-image-uploads/release-reserved-image-uploads.use-case.js';
import { filesConfig } from './config/files.config.js';
import { S3_CLIENT } from './infrastructure/s3/s3.constants.js';
import { FilesGrpcController } from './presentation/grpc/files-grpc.controller.js';
import { FilesRepository } from './application/ports/files.repository.js';
import { databaseConfig } from './config/database.config.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { PrismaFilesRepository } from './infrastructure/prisma/repositories/prisma-files.repository.js';
import { ObjectStorage } from './application/ports/object-storage.js';
import { S3ObjectStorage } from './infrastructure/s3/s3-object-storage.js';
import { TestingRepository } from './application/ports/testing.repository.js';
import { DeleteAllDataUseCase } from './application/use-cases/delete-all-data/delete-all-data.use-case.js';
import { PrismaTestingRepository } from './infrastructure/prisma/repositories/prisma-testing.repository.js';
import { TestingGrpcController } from './presentation/grpc/testing-grpc.controller.js';
import { ExpiredImageUploadsCleanupJob } from './infrastructure/scheduling/expired-image-uploads-cleanup.job.js';
import { GetFileDownloadUrlQueryHandler } from './application/use-cases/get-public-file-url/get-public-file-url.query-handler.js';
import { GetPublicFileUrlQueryHandler } from './application/use-cases/get-public-file-url/get-public-file-url.query-handler.js';
import { PostDeletedEventConsumer } from './presentation/messaging/post-deleted-event.consumer.js';
import { filesMessageBrokerConfig } from './config/message-broker.config.js';
import { InboxEventsRepository } from './application/ports/inbox-events.repository.js';
import { PrismaInboxEventsRepository } from './infrastructure/prisma/repositories/prisma-inbox-events.repository.js';
import { ScheduleModule } from '@nestjs/schedule';
import { PostDeletedInboxScheduler } from './infrastructure/scheduling/post-deleted-inbox.scheduler.js';
import { PostDeletedInboxWorker } from './application/workers/post-deleted-inbox.worker.js';
import { UnitOfWork } from './application/ports/unit-of-work.js';
import { PrismaUnitOfWork } from './infrastructure/prisma/prisma-unit-of-work.js';
import { FileDeletionJobsRepository } from './application/ports/file-deletion-jobs.repository.js';
import { PrismaFileDeletionJobsRepository } from './infrastructure/prisma/repositories/prisma-file-deletion-jobs.repository.js';
import { FileDeletionJobsWorker } from './application/workers/file-deletion-jobs.worker.js';
import { FileDeletionJobsScheduler } from './infrastructure/scheduling/file-deletion-jobs.scheduler.js';

@Module({
  imports: [
    CqrsModule,
    ScheduleModule.forRoot(),
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
  controllers: [FilesGrpcController, TestingGrpcController, PostDeletedEventConsumer],
  providers: [
    AttachReservedImageUploadsUseCase,
    CleanupExpiredImageUploadsUseCase,
    CompleteImageUploadsUseCase,
    DeleteAllDataUseCase,
    InitiateImageUploadsUseCase,
    GetFileDownloadUrlQueryHandler,
    ReleaseReservedImageUploadsUseCase,
    ReserveImageUploadsUseCase,
    ExpiredImageUploadsCleanupJob,
    GetPublicFileUrlQueryHandler,
    PostDeletedInboxScheduler,
    PostDeletedInboxWorker,
    FileDeletionJobsWorker,
    FileDeletionJobsScheduler,
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
    {
      provide: InboxEventsRepository,
      useClass: PrismaInboxEventsRepository,
    },
    {
      provide: UnitOfWork,
      useClass: PrismaUnitOfWork,
    },
    {
      provide: FileDeletionJobsRepository,
      useClass: PrismaFileDeletionJobsRepository,
    },
  ],
})
export class FilesModule {}
