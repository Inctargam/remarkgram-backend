import { Injectable } from '@nestjs/common';
import {
  type AddFileDeletionJobRepositoryParams,
  FileDeletionJobsRepository,
  type FindAvailableFileDeletionJobRepositoryParams,
  type FindAvailableFileDeletionJobRepositoryResult,
} from '../../../application/ports/file-deletion-jobs.repository.js';
import type { TransactionContext } from '../../../application/ports/unit-of-work.js';
import { FileDeletionJobStatus } from '../../../domain/enums/file-deletion-job-status.enum.js';
import { Prisma } from '../generated/client.js';
import { PrismaService } from '../prisma.service.js';

type ClaimedFileDeletionJobRaw = {
  file_id: string;
  object_key: string;
  lease_until: Date;
};

@Injectable()
export class PrismaFileDeletionJobsRepository extends FileDeletionJobsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private getClient(ctx?: TransactionContext) {
    return (ctx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }

  async addMany(params: AddFileDeletionJobRepositoryParams, ctx?: TransactionContext): Promise<void> {
    if (params.data.length === 0) return;

    const client = this.getClient(ctx);
    await client.fileDeletionJob.createMany({
      data: params.data,
      skipDuplicates: true,
    });
  }

  async findAvailableBatch(
    params: FindAvailableFileDeletionJobRepositoryParams,
  ): Promise<FindAvailableFileDeletionJobRepositoryResult> {
    /*
     * exhausted_jobs восстанавливает корректное состояние после аварийного
     * завершения worker. Количество attempts увеличивается во время claim,
     * поэтому процесс может получить последнюю разрешённую попытку и упасть до
     * вызова resolveFailedAttempt. После истечения lease такая задача осталась
     * бы в PENDING навсегда: attempts уже достиг maxAttempts, а основной claim
     * выбирает только задачи с attempts < maxAttempts. Перед новым claim
     * переводим эти больше никем не обрабатываемые задачи в DEAD.
     */
    const jobs = await this.prisma.$queryRaw<ClaimedFileDeletionJobRaw[]>`
      WITH exhausted_jobs AS (
        UPDATE file_deletion_jobs
        SET status = ${FileDeletionJobStatus.DEAD}::"FileDeletionJobStatus",
            last_error = COALESCE(last_error, 'Maximum deletion attempts reached'),
            lease_until = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE status = ${FileDeletionJobStatus.PENDING}::"FileDeletionJobStatus"
          AND attempts >= ${params.maxAttempts}
          AND (lease_until IS NULL OR lease_until <= CURRENT_TIMESTAMP)
      ),
      available_jobs AS (
        SELECT file_id
        FROM file_deletion_jobs
        WHERE status = ${FileDeletionJobStatus.PENDING}::"FileDeletionJobStatus"
          AND attempts < ${params.maxAttempts}
          AND available_at <= CURRENT_TIMESTAMP
          AND (lease_until IS NULL OR lease_until <= CURRENT_TIMESTAMP)
        ORDER BY available_at, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${params.batchSize}
      )
      UPDATE file_deletion_jobs AS job
      SET attempts = job.attempts + 1,
          lease_until = date_trunc(
            'milliseconds',
            CURRENT_TIMESTAMP + INTERVAL '2 minutes'
          ),
          updated_at = CURRENT_TIMESTAMP
      FROM available_jobs
      WHERE job.file_id = available_jobs.file_id
      RETURNING job.file_id, job.object_key, job.lease_until;
    `;

    if (jobs.length === 0) return null;

    return jobs.map((job) => ({
      fileId: job.file_id,
      objectKey: job.object_key,
      leaseUntil: job.lease_until,
    }));
  }

  async markAsDone(fileId: string, leaseUntil: Date, ctx?: TransactionContext): Promise<boolean> {
    const client = this.getClient(ctx);
    const result = await client.fileDeletionJob.updateMany({
      where: {
        fileId,
        status: FileDeletionJobStatus.PENDING,
        leaseUntil,
      },
      data: {
        status: FileDeletionJobStatus.DONE,
        doneAt: new Date(),
        leaseUntil: null,
        lastError: null,
      },
    });

    return result.count === 1;
  }

  async resolveFailedAttempt(
    fileId: string,
    leaseUntil: Date,
    lastError: string,
    maxAttempts: number,
  ): Promise<boolean> {
    const result = await this.prisma.$executeRaw`
      UPDATE file_deletion_jobs
      SET status = CASE
                     WHEN attempts >= ${maxAttempts}
                       THEN ${FileDeletionJobStatus.DEAD}::"FileDeletionJobStatus"
                     ELSE ${FileDeletionJobStatus.PENDING}::"FileDeletionJobStatus"
                   END,
          available_at = CASE
                           WHEN attempts >= ${maxAttempts}
                             THEN available_at
                           ELSE CURRENT_TIMESTAMP + (
                             INTERVAL '10 seconds' * power(2, attempts - 1)
                           )
                         END,
          lease_until = NULL,
          last_error = ${lastError},
          updated_at = CURRENT_TIMESTAMP
      WHERE file_id = ${fileId}::uuid
        AND status = ${FileDeletionJobStatus.PENDING}::"FileDeletionJobStatus"
        AND lease_until = ${leaseUntil};
    `;

    return result === 1;
  }
}
