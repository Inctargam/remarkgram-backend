import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CleanupExpiredImageUploadsCommand } from '../../application/use-cases/cleanup-expired-image-uploads/cleanup-expired-image-uploads.use-case.js';

@Injectable()
export class ExpiredImageUploadsCleanupJob {
  constructor(private readonly commandBus: CommandBus) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    waitForCompletion: true,
  })
  async handle(): Promise<void> {
    await this.commandBus.execute(new CleanupExpiredImageUploadsCommand(new Date()));
  }
}
