import { FILES_GRPC_PROTO_PATH, REMARKGRAM_FILES_V1_PACKAGE_NAME } from '@app/files-grpc';
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
import { FilesImageUploadsVerifier } from './infrastructure/grpc/files-image-uploads-verifier.js';
import { PrismaService } from './infrastructure/prisma/prisma.service.js';
import { PrismaPostsRepository } from './infrastructure/prisma/repositories/prisma-posts.repository.js';
import { PostsGrpcController } from './presentation/grpc/posts-grpc.controller.js';
import { TestingRepository } from './application/ports/testing.repository.js';
import { DeleteAllDataUseCase } from './application/use-cases/delete-all-data/delete-all-data.use-case.js';
import { PrismaTestingRepository } from './infrastructure/prisma/repositories/prisma-testing.repository.js';
import { TestingGrpcController } from './presentation/grpc/testing-grpc.controller.js';
import { UpdatePostUseCase } from './application/use-cases/update-post/update-post.use-case.js';
import { PrismaPostsQueryRepository } from './infrastructure/prisma/repositories/prisma-posts-query.repository.js';
import { PostsQueryRepository } from './application/ports/posts-query.repository.js';
import { GetAuthorPostsQueryHandler } from './application/use-cases/get-author-posts/get-author-posts.query-handler.js';

@Module({
  imports: [
    CqrsModule,
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
      load: [postsConfig, databaseConfig, filesGrpcClientConfig],
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
    ]),
  ],
  controllers: [PostsGrpcController, TestingGrpcController],
  providers: [
    CreatePostUseCase,
    DeleteAllDataUseCase,
    PrismaService,
    UpdatePostUseCase,
    GetAuthorPostsQueryHandler,
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
  ],
})
export class AppModule {}
