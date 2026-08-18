import { FILES_GRPC_PROTO_PATH, REMARKGRAM_FILES_V1_PACKAGE_NAME } from '@app/files-grpc';
import { FILES_POST_EVENTS_QUEUE, POST_DELETED_V1_EVENT_NAME, POSTS_EXCHANGE } from '@app/message-broker';
import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ImageUploadsVerifier } from './application/ports/image-uploads-verifier.js';
import { PostsRepository } from './application/ports/posts.repository.js';
import { CreatePostUseCase } from './application/use-cases/create-post/create-post.use-case.js';
import { databaseConfig } from './config/database.config.js';
import { filesGrpcClientConfig } from './config/files-grpc-client.config.js';
import { postsConfig } from './config/posts.config.js';
import { postsMessageBrokerConfig } from './config/message-broker.config.js';
import { FilesImageUploadsVerifier } from './infrastructure/grpc/files-image-uploads-verifier.js';
import { PrismaService } from './infrastructure/prisma/prisma.service.js';
import { PrismaPostsRepository } from './infrastructure/prisma/repositories/prisma-posts.repository.js';
import { PostsGrpcController } from './presentation/grpc/posts-grpc.controller.js';
import { TestingRepository } from './application/ports/testing.repository.js';
import { DeleteAllDataUseCase } from './application/use-cases/delete-all-data/delete-all-data.use-case.js';
import { PrismaTestingRepository } from './infrastructure/prisma/repositories/prisma-testing.repository.js';
import { TestingGrpcController } from './presentation/grpc/testing-grpc.controller.js';
import { PrismaPostsQueryRepository } from './infrastructure/prisma/repositories/prisma-posts-query.repository.js';
import { PostsQueryRepository } from './application/ports/posts-query.repository.js';
import { GetAuthorPostsQueryHandler } from './application/use-cases/get-author-posts/get-author-posts.query-handler.js';
import { UpdatePostUseCase } from './application/use-cases/update-post/update-post.use-case.js';
import { UnitOfWork } from './application/ports/unit-of-work.js';
import { PrismaUnitOfWork } from './infrastructure/prisma/prisma-unit-of-work.js';
import { OutboxEventsRepository } from './application/ports/outbox-events.repository.js';
import { PrismaOutboxEventsRepository } from './infrastructure/prisma/repositories/prisma-outbox-events.repository.js';
import { DeletePostUseCase } from './application/use-cases/delete-post/delete-post.use-case.js';
import { PostsEventsPublisher } from './application/ports/posts-events.publisher.js';
import { RmqPostsEventsPublisher } from './infrastructure/rmq/rmq-posts-events.publisher.js';
import { POSTS_EVENTS_RMQ_CLIENT } from './infrastructure/rmq/rmq.constants.js';
import { ScheduleModule } from '@nestjs/schedule';
import { DeletedPostsPublisherWorker } from './application/workers/deleted-posts-publisher.worker.js';

@Module({
  imports: [
    CqrsModule,
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [
        `apps/posts/.env.${process.env.NODE_ENV}.local`,
        `apps/posts/.env.${process.env.NODE_ENV}`,
        'apps/posts/.env.production',
        'apps/posts/.env',
        `.env.${process.env.NODE_ENV}.local`,
        `.env.${process.env.NODE_ENV}`,
        '.env.production',
        '.env',
      ],
      load: [postsConfig, databaseConfig, filesGrpcClientConfig, postsMessageBrokerConfig],
    }),
    ClientsModule.registerAsync([
      {
        name: REMARKGRAM_FILES_V1_PACKAGE_NAME,
        inject: [filesGrpcClientConfig.KEY],
        useFactory: (config: ConfigType<typeof filesGrpcClientConfig>) => ({
          transport: Transport.GRPC,
          options: {
            package: REMARKGRAM_FILES_V1_PACKAGE_NAME,
            protoPath: FILES_GRPC_PROTO_PATH,
            url: config.url,
          },
        }),
      },
      {
        name: POSTS_EVENTS_RMQ_CLIENT,
        inject: [postsMessageBrokerConfig.KEY],
        useFactory: (config: ConfigType<typeof postsMessageBrokerConfig>) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.url],
            queue: FILES_POST_EVENTS_QUEUE,
            queueOptions: {
              durable: true,
            },
            exchange: POSTS_EXCHANGE,
            exchangeType: 'topic',
            routingKey: POST_DELETED_V1_EVENT_NAME,
            wildcards: true,
            persistent: true,
          },
        }),
      },
    ]),
  ],
  controllers: [PostsGrpcController, TestingGrpcController],
  providers: [
    CreatePostUseCase,
    DeleteAllDataUseCase,
    PrismaService,
    UpdatePostUseCase,
    GetAuthorPostsQueryHandler,
    DeletePostUseCase,
    DeletedPostsPublisherWorker,
    {
      provide: PostsRepository,
      useClass: PrismaPostsRepository,
    },
    {
      provide: ImageUploadsVerifier,
      useClass: FilesImageUploadsVerifier,
    },
    {
      provide: TestingRepository,
      useClass: PrismaTestingRepository,
    },
    {
      provide: PostsQueryRepository,
      useClass: PrismaPostsQueryRepository,
    },
    {
      provide: UnitOfWork,
      useClass: PrismaUnitOfWork,
    },
    {
      provide: OutboxEventsRepository,
      useClass: PrismaOutboxEventsRepository,
    },
    {
      provide: PostsEventsPublisher,
      useClass: RmqPostsEventsPublisher,
    },
  ],
})
export class AppModule {}
