import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { FilesRepository } from '../../ports/files.repository.js';
import { ObjectStorage } from '../../ports/object-storage.js';

const CLEANUP_BATCH_SIZE = 100;
const EXPIRATION_GRACE_PERIOD_MS = 15 * 60 * 1_000;
const REJECTED_CLEANUP_GRACE_PERIOD_MS = 15 * 60 * 1_000;
const COMPLETED_UPLOAD_RETENTION_MS = 24 * 60 * 60 * 1_000;
const CLEANUP_CLAIM_TIMEOUT_MS = 60 * 60 * 1_000;

export class CleanupExpiredImageUploadsCommand extends Command<void> {
  constructor(public readonly startedAt: Date) {
    super();
  }
}

@CommandHandler(CleanupExpiredImageUploadsCommand)
export class CleanupExpiredImageUploadsUseCase implements ICommandHandler<CleanupExpiredImageUploadsCommand> {
  constructor(
    private readonly filesRepository: FilesRepository,
    private readonly objectStorage: ObjectStorage,
  ) {}

  async execute(command: CleanupExpiredImageUploadsCommand) {
    const { startedAt } = command;
    const pendingExpiredBefore = new Date(startedAt.getTime() - EXPIRATION_GRACE_PERIOD_MS);
    const rejectedBefore = new Date(startedAt.getTime() - REJECTED_CLEANUP_GRACE_PERIOD_MS);
    const completedBefore = new Date(startedAt.getTime() - COMPLETED_UPLOAD_RETENTION_MS);
    const retryBefore = new Date(startedAt.getTime() - CLEANUP_CLAIM_TIMEOUT_MS);
    const imageUploads = await this.filesRepository.claimExpiredImageUploads({
      pendingExpiredBefore,
      completedBefore,
      rejectedBefore,
      retryBefore,
      claimedAt: startedAt,
      limit: CLEANUP_BATCH_SIZE,
    });

    await Promise.all(
      imageUploads.map(async ({ id, objectKey }) => {
        // DeleteObject идемпотентен: повторный запрос безопасен, если объект был удалён
        // в прошлой попытке, а удалить запись из БД тогда не удалось.
        await this.objectStorage.deleteObject(objectKey);
        const wasDeleted = await this.filesRepository.deleteClaimedImageUpload({
          uploadId: id,
          claimedAt: startedAt,
        });

        if (!wasDeleted) {
          throw new Error('Image upload cleanup claim is no longer owned by this job');
        }
      }),
    );
  }
}
