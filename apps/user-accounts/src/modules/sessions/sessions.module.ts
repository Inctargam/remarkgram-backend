import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../../database/prisma.module.js';
import { SessionsQueryRepository } from './application/ports/sessions-query.repository.js';
import { SessionsRepository } from './application/ports/sessions.repository.js';
import { SessionsService } from './application/sessions.service.js';
import { GetSessionsUseCase } from './application/use-cases/get-sessions.use-case.js';
import { PrismaSessionsQueryRepository } from './infrastructure/persistence/prisma-sessions-query.repository.js';
import { PrismaSessionsRepository } from './infrastructure/persistence/prisma-sessions.repository.js';
import { SessionsGrpcController } from './presentation/grpc/sessions-grpc.controller.js';

@Module({
  imports: [CqrsModule, PrismaModule],
  controllers: [SessionsGrpcController],
  providers: [
    {
      provide: SessionsRepository,
      useClass: PrismaSessionsRepository,
    },
    {
      provide: SessionsQueryRepository,
      useClass: PrismaSessionsQueryRepository,
    },
    SessionsService,
    GetSessionsUseCase,
  ],
  exports: [SessionsService],
})
export class SessionsModule {}
