import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { InvalidUserIdError } from '../../errors/image-upload.errors.js';
import { FileDeletionJobsRepository } from '../../ports/file-deletion-jobs.repository.js';
import { FilesRepository } from '../../ports/files.repository.js';
import { UnitOfWork } from '../../ports/unit-of-work.js';

export class ScheduleAttachedFileDeletionCommand extends Command<void> {
  constructor(public readonly params: { userId: number; fileId: string }) {
    super();
  }
}

@CommandHandler(ScheduleAttachedFileDeletionCommand)
export class ScheduleAttachedFileDeletionUseCase implements ICommandHandler<ScheduleAttachedFileDeletionCommand> {
  constructor(
    private readonly filesRepository: FilesRepository,
    private readonly deletionJobsRepository: FileDeletionJobsRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute({ params }: ScheduleAttachedFileDeletionCommand): Promise<void> {
    if (!Number.isSafeInteger(params.userId) || params.userId <= 0) throw new InvalidUserIdError();
    await this.unitOfWork.run(async (ctx) => {
      const files = await this.filesRepository.softDeleteAttachedFile(params.fileId, params.userId, ctx);
      await this.deletionJobsRepository.addMany(
        {
          data: files.map((file) => {
            if (!file.deletedAt) throw new Error('Soft-deleted file has no deletion timestamp');
            return { fileId: file.id, objectKey: file.objectKey, availableAt: file.deletedAt };
          }),
        },
        ctx,
      );
    });
  }
}
